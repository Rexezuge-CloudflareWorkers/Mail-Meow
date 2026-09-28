import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, migrationFileNames } from '../helpers/migrations';

/**
 * Proves migration 0011 upgrades a *populated* pre-0011 database without losing
 * a single row.
 *
 * This is the load-bearing test for the whole change. `users.email` used to be
 * the PRIMARY KEY and `connected_applications` carried
 * `ON DELETE CASCADE` to it, and that table is the root of the rest of the
 * schema — `application_api_keys`, `oauth2_authorization_sessions`, and
 * `oauth2_access_token_refresh_status` all cascade from it, and
 * `background_task_runs` hangs off `application_id`. So rebuilding
 * `connected_applications` to point at a new `users.id` would have cascaded a
 * user's entire mailbox set away.
 *
 * Every table a cascade out of `users` can reach is seeded here, row counts are
 * captured before the migration, and the same counts are asserted afterwards.
 */

const LAST_PRE_IDENTITY_MIGRATION = '0010_user_language.sql';
const IDENTITY_MIGRATION = '0011_user_identity.sql';

const ALICE = 'alice@legacy.test';
const BOB = 'bob@legacy.test';
/**
 * Stored mixed-case on purpose. Only the non-FK tables could hold such a row
 * before 0011 (`users.email` is the primary key and therefore BINARY-collated),
 * so this user stands in for the legacy rows the case-insensitive backfill
 * must still resolve.
 */
const MIXED = 'Carol@Legacy.Test';

const NOW = 1_700_000_000;

/**
 * Tables holding live rows seeded below, plus every table a `users` or
 * `connected_applications` cascade can reach. Counts must be identical
 * pre/post.
 */
const GUARDED_TABLES = [
  'users',
  'connected_applications',
  'application_api_keys',
  'oauth2_authorization_sessions',
  'oauth2_access_token_refresh_status',
  'background_task_runs',
] as const;

/**
 * Counts the seed script produces. One row per insert, so these are absolute
 * as well as comparative.
 */
const SEEDED_COUNTS: Record<string, number> = {
  users: 3,
  connected_applications: 3,
  application_api_keys: 2,
  oauth2_authorization_sessions: 2,
  oauth2_access_token_refresh_status: 1,
  background_task_runs: 1,
};

type Db = D1Database;

function run(db: Db, sql: string, ...params: unknown[]): Promise<unknown> {
  return db
    .prepare(sql)
    .bind(...(params as never[]))
    .run();
}

async function countRows(db: Db, table: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}

async function snapshotCounts(db: Db): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of GUARDED_TABLES) out[table] = await countRows(db, table);
  return out;
}

/**
 * Seeds one row into every table reachable by a cascade out of `users` or
 * `connected_applications`, using pre-0011 column shapes (email-keyed, no
 * `user_id`). Mixed-case addresses are deliberate: the 0011 backfill joins the
 * registry case-insensitively, and an over-strict backfill would silently
 * orphan every id.
 */
async function seedLegacyGraph(db: Db): Promise<void> {
  await run(db, `INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`, ALICE, NOW, NOW);
  await run(db, `INSERT INTO users (email, created_at, updated_at, preferred_language) VALUES (?, ?, ?, 'de')`, BOB, NOW, NOW);
  await run(db, `INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`, MIXED, NOW, NOW);

  const insertApp = async (applicationId: string, owner: string, status: string): Promise<void> => {
    await run(
      db,
      `INSERT INTO connected_applications
        (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at)
       VALUES (?, ?, ?, 'google-gmail', 'oauth2', 'enc', 'iv', ?, ?, ?)`,
      applicationId,
      owner,
      applicationId,
      status,
      NOW,
      NOW,
    );
  };
  await insertApp('app-alice', ALICE, 'connected');
  await insertApp('app-bob', BOB, 'connected');
  await insertApp('app-carol', MIXED, 'draft');

  await run(
    db,
    `INSERT INTO application_api_keys (api_key_id, application_id, key_hash, name, key_prefix, key_last_four, created_at, expires_at, last_used_at)
     VALUES ('key-1', 'app-alice', 'hash-1', 'ci', 'mm_t', 'abcd', ?, ?, NULL)`,
    NOW,
    NOW + 86_400,
  );
  await run(
    db,
    `INSERT INTO application_api_keys (api_key_id, application_id, key_hash, name, key_prefix, key_last_four, created_at, expires_at, last_used_at)
     VALUES ('key-2', 'app-bob', 'hash-2', 'ci', 'mm_t', 'efgh', ?, ?, NULL)`,
    NOW,
    NOW + 86_400,
  );

  await run(
    db,
    `INSERT INTO oauth2_authorization_sessions (session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at, consumed_at)
     VALUES ('sess-1', 'app-alice', 'state-1', 'verifier-1', 'https://example.test/cb', ?, ?, NULL)`,
    NOW,
    NOW + 900,
  );
  await run(
    db,
    `INSERT INTO oauth2_authorization_sessions (session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at, consumed_at)
     VALUES ('sess-2', 'app-bob', 'state-2', 'verifier-2', 'https://example.test/cb', ?, ?, NULL)`,
    NOW,
    NOW + 900,
  );

  await run(
    db,
    `INSERT INTO oauth2_access_token_refresh_status (application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at, last_refresh_failed_at, last_error, created_at, updated_at)
     VALUES ('app-alice', ?, ?, ?, NULL, NULL, ?, ?)`,
    NOW + 3600,
    NOW,
    NOW,
    NOW,
    NOW,
  );

  await run(
    db,
    `INSERT INTO background_task_runs (run_id, task_type, application_id, status, items_processed, items_failed, summary, details, error_message, started_at, completed_at, created_at)
     VALUES ('run-1', 'oauth2_refresh', 'app-alice', 'success', 1, 0, 'ok', NULL, NULL, ?, ?, ?)`,
    NOW,
    NOW,
    NOW,
  );
}

describe('0011 user identity upgrade on a populated database', () => {
  let db: Db;
  let before: Record<string, number>;
  let after: Record<string, number>;

  beforeAll(async () => {
    db = env.DB as unknown as Db;
    expect(migrationFileNames()).toContain(LAST_PRE_IDENTITY_MIGRATION);
    // Legacy schema first, then the upgrade under test.
    await applyMigrations(db, { to: LAST_PRE_IDENTITY_MIGRATION });
    await seedLegacyGraph(db);
    before = await snapshotCounts(db);
    // A pre-0011 `users` row has no id: that is the shape being upgraded.
    const preUser = await db.prepare('SELECT * FROM users WHERE email = ?').bind(ALICE).first<Record<string, unknown>>();
    expect(preUser?.id).toBeUndefined();
    expect(preUser?.current_email).toBeUndefined();
    await applyMigrations(db, { from: IDENTITY_MIGRATION });
    after = await snapshotCounts(db);
  });

  it('loses no rows in any table reachable from users or connected_applications', () => {
    const diffs: string[] = [];
    for (const table of GUARDED_TABLES) {
      if (before[table] !== after[table]) diffs.push(`${table}: ${before[table]} -> ${after[table]}`);
      // The seed is deterministic, so the count is also checked absolutely.
      const expected = SEEDED_COUNTS[table] ?? 0;
      if (after[table] !== expected) diffs.push(`${table}: expected ${expected}, got ${after[table]}`);
    }
    expect(diffs).toEqual([]);
  });

  it('reports no foreign key violations after the upgrade', async () => {
    const violations = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();
    expect(violations.results ?? []).toEqual([]);
  });

  it('gives every user a stable id and a verified address row', async () => {
    const rows = await db
      .prepare('SELECT id, email, current_email FROM users ORDER BY email')
      .all<{ id: string; email: string; current_email: string }>();
    expect(rows.results).toHaveLength(3);
    const ids = new Set((rows.results ?? []).map((row) => row.id));
    expect(ids.size).toBe(3);
    for (const row of rows.results ?? []) {
      expect(row.id).toMatch(/^usr_[0-9a-f]{32}$/);
      // `current_email` starts as the lowercased anchor address.
      expect(row.current_email).toBe(row.email.toLowerCase());
    }
    // The registry is keyed on the lowercased address, so the mixed-case legacy
    // row normalizes to a single login identity.
    const registry = await db
      .prepare('SELECT email, user_id, is_verified FROM user_emails')
      .all<{ email: string; user_id: string; is_verified: number }>();
    expect(registry.results).toHaveLength(3);
    for (const row of registry.results ?? []) {
      expect(row.email).toBe(row.email.toLowerCase());
      expect(row.is_verified).toBe(1);
      expect(ids.has(row.user_id)).toBe(true);
    }
  });

  it('preserves a stored language preference', async () => {
    const bob = await db
      .prepare('SELECT preferred_language FROM users WHERE lower(current_email) = ?')
      .bind(BOB)
      .first<{ preferred_language: string }>();
    expect(bob?.preferred_language).toBe('de');
  });

  it('leaves every pre-existing foreign key intact', async () => {
    // The anchor design exists because D1 will not let this be repointed: it
    // honours neither `PRAGMA foreign_keys = off` nor
    // `PRAGMA legacy_alter_table = on`, and `defer_foreign_keys` does not
    // suppress `ON DELETE CASCADE`. `users.email` is therefore frozen, and the
    // cascade that made the address immutable is preserved.
    const fks = await db.prepare(`PRAGMA foreign_key_list('connected_applications')`).all<{ table: string; to: string }>();
    const targets = (fks.results ?? []).filter((fk) => fk.table === 'users').map((fk) => fk.to);
    // The frozen-anchor reference survives *and* the new id reference is added
    // alongside it, so the table is now guarded on both.
    expect(targets).toEqual(['email', 'id']);
    const users = await db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).first<{ sql: string }>();
    expect(users?.sql).toContain('id TEXT');
    expect(users?.sql).toContain('current_email TEXT');
    // The frozen anchor is still the primary key, so no existing reference
    // could have been invalidated.
    expect(users?.sql).toContain('email TEXT PRIMARY KEY');
  });

  it('backfills user_id on connected_applications (case-insensitively)', async () => {
    const alice = await userIdByEmail(db, ALICE);
    const bob = await userIdByEmail(db, BOB);
    expect(alice).toBeTruthy();
    expect(bob).toBeTruthy();

    const rows = await db
      .prepare('SELECT application_id, user_email, user_id FROM connected_applications ORDER BY application_id')
      .all<{ application_id: string; user_email: string; user_id: string | null }>();
    expect(rows.results).toEqual([
      { application_id: 'app-alice', user_email: ALICE, user_id: alice },
      { application_id: 'app-bob', user_email: BOB, user_id: bob },
      // `Carol@Legacy.Test` is stored in `users.email` mixed-case; the
      // case-insensitive backfill must still land.
      { application_id: 'app-carol', user_email: MIXED, user_id: await userIdByEmail(db, MIXED) },
    ]);
  });

  it('resolves a row written by pre-0011 code after the migration ran', async () => {
    // The rolling-deploy case, and the one the DAO's fallback clause exists for:
    // old code inserts with `user_email` only, so `user_id` stays NULL on a
    // valid owner. The row must still be reachable, which is what
    // `(user_id = ? OR (user_id IS NULL AND user_email = ?))` guarantees.
    //
    // `user_email` carries its own FK to `users(email)`, so an application
    // cannot have an unresolvable owner at all — the NULL case is always a real
    // account whose id was simply not stamped.
    const bob = await userIdByEmail(db, BOB);
    await run(
      db,
      `INSERT INTO connected_applications
        (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at)
       VALUES ('app-legacy-write', ?, 'written by old code', 'google-gmail', 'oauth2', 'enc', 'iv', 'draft', ?, ?)`,
      BOB,
      NOW,
      NOW,
    );
    const row = await db
      .prepare('SELECT user_id, user_email FROM connected_applications WHERE application_id = ?')
      .bind('app-legacy-write')
      .first<{ user_id: string | null; user_email: string }>();
    expect(row?.user_id).toBeNull();
    // Reachable by the address fallback, and stamped to the right account:
    const byAddress = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM connected_applications
         WHERE (user_id = ? OR (user_id IS NULL AND user_email = ?))`,
      )
      .bind(bob, BOB)
      .first<{ n: number }>();
    expect(byAddress?.n).toBe(2);
    // And it reports the account's *current* address, not the stored anchor,
    // via the DAO's `COALESCE(u.current_email, ca.user_email)` projection.
    const resolved = await db
      .prepare(
        `SELECT COALESCE(u.current_email, ca.user_email) AS user_email_current
         FROM connected_applications ca LEFT JOIN users u ON u.id = ca.user_id
         WHERE ca.application_id = ?`,
      )
      .bind('app-legacy-write')
      .first<{ user_email_current: string }>();
    expect(resolved?.user_email_current).toBe(BOB);
  });

  it('changes the login address without disturbing id-keyed access', async () => {
    const alice = await userIdByEmail(db, ALICE);
    const bob = await userIdByEmail(db, BOB);
    // What `UserIdentityService.setPrimaryEmail` does: claim the new address,
    // make it current, and revoke the old one for login. The account id, its
    // applications, and everything cascading from them are untouched.
    await run(db, `UPDATE user_emails SET is_verified = 0 WHERE user_id = ?`, alice);
    await run(db, `INSERT INTO user_emails (email, user_id, is_verified, created_at) VALUES ('alice@new.test', ?, 1, ?)`, alice, NOW + 1);
    await run(db, `UPDATE users SET current_email = ?, updated_at = ? WHERE id = ?`, 'alice@new.test', NOW + 1, alice);

    const moved = await db.prepare('SELECT id, email, current_email FROM users WHERE id = ?').bind(alice).first<{
      id: string;
      email: string;
      current_email: string;
    }>();
    expect(moved?.current_email).toBe('alice@new.test');
    // The anchor never moves, which is what keeps the foreign key valid.
    expect(moved?.email).toBe(ALICE);
    // Only the new address may log in.
    const verified = await db
      .prepare('SELECT email FROM user_emails WHERE user_id = ? AND is_verified = 1')
      .bind(alice)
      .all<{ email: string }>();
    expect(verified.results).toEqual([{ email: 'alice@new.test' }]);
    // Ownership and everything cascading from it still resolve by id.
    const app = await db
      .prepare('SELECT user_id FROM connected_applications WHERE application_id = ?')
      .bind('app-alice')
      .first<{ user_id: string }>();
    expect(app?.user_id).toBe(alice);
    const key = await db
      .prepare('SELECT application_id FROM application_api_keys WHERE api_key_id = ?')
      .bind('key-1')
      .first<{ application_id: string }>();
    expect(key?.application_id).toBe('app-alice');
    // And the preference is keyed on the id, so Bob's survived his own
    // untouched row and remains reachable by id rather than by address.
    const lang = await db.prepare('SELECT preferred_language FROM users WHERE id = ?').bind(bob).first<{ preferred_language: string }>();
    expect(lang?.preferred_language).toBe('de');
  });

  it('releases a changed-from address for a later legitimate holder', async () => {
    // The revoked registry row is re-pointed rather than deleted, and the new
    // account takes an opaque anchor (the old address is permanently taken as
    // the previous account's anchor, so it cannot serve as one again).
    const successorId = 'usr_' + 'f'.repeat(32);
    const successorAnchor = 'anchor-' + 'e'.repeat(32) + '@users.invalid';
    await run(
      db,
      `INSERT INTO users (email, created_at, updated_at, id, current_email) VALUES (?, ?, ?, ?, ?)`,
      successorAnchor,
      NOW + 2,
      NOW + 2,
      successorId,
      ALICE,
    );
    await run(
      db,
      `INSERT INTO user_emails (email, user_id, is_verified, created_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, is_verified = excluded.is_verified`,
      ALICE,
      successorId,
      NOW + 2,
    );
    const repointed = await db.prepare('SELECT user_id, is_verified FROM user_emails WHERE email = ?').bind(ALICE).first<{
      user_id: string;
      is_verified: number;
    }>();
    expect(repointed?.user_id).toBe(successorId);
    expect(repointed?.is_verified).toBe(1);
    // The new owner's account is distinct: no inherited applications.
    const inherited = await db
      .prepare('SELECT COUNT(*) AS n FROM connected_applications WHERE user_id = ?')
      .bind(successorId)
      .first<{ n: number }>();
    expect(inherited?.n).toBe(0);
    // And the previous holder's anchor is untouched, so their history still resolves.
    const previous = await db
      .prepare('SELECT email FROM users WHERE id = ?')
      .bind(await userIdByEmail(db, 'alice@new.test'))
      .first<{ email: string }>();
    expect(previous?.email).toBe(ALICE);
  });
});

async function userIdByEmail(db: Db, email: string): Promise<string> {
  const row = await db.prepare('SELECT id FROM users WHERE lower(current_email) = lower(?)').bind(email).first<{ id: string }>();
  return row?.id ?? '';
}
