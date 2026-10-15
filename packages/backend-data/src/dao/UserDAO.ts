import { newAccountId, UserDAO as KitUserDAO } from '@rexezuge/identity';
import type { UserRow as KitUserRow } from '@rexezuge/identity';
import { normalizeEmail, TimestampUtil } from '@rexezuge/shared';
import type { AccountIdentity, User, UserInternal } from '@mail-meow/shared/model';

/**
 * A row of the `users` table.
 *
 * Two columns are narrowed against the kit's `UserRow`, and both narrowings are
 * facts about *this* schema rather than wishes about it:
 *
 * - `username: null` because nothing ever added a handle column. The kit
 *   declares it `string | null`; here it is absent, and `null` is what
 *   `summarize` reads it as — so the absence is stated rather than left to a
 *   `SELECT *` that happens not to return the key.
 * - `updated_at: number`, not `number | null`. The kit widens it for repos
 *   whose column is nullable; `migrations/0006_add_updated_at_column.sql` made
 *   this one `NOT NULL`, and {@link UserDAO.createUser} has to write it
 *   because of that.
 */
interface UserRow extends Omit<KitUserRow, 'username' | 'updated_at'> {
  username: null;
  updated_at: number;
  preferred_language?: string | null;
}

const UPDATE_BY_ID = 'UPDATE users SET preferred_language = ?, updated_at = ? WHERE id = ?';
const UPDATE_BY_ANCHOR = 'UPDATE users SET preferred_language = ?, updated_at = ? WHERE email = ?';

/**
 * The kit's `users` DAO, plus this database's two departures.
 *
 * ## Why this is a subclass rather than a re-export
 *
 * **The column.** `users` here carries `preferred_language` (migration 0010),
 * which is a *user-facing setting*: `PUT /user/me` writes it, the SPA's language
 * selector reads it back, and the greeting locale resolves from it. Dropping the
 * column to match the kit would be a product regression, not a convergence — so
 * it stays and this DAO stays, inheriting rather than copying everything the
 * kit already got right.
 *
 * **The `NOT NULL` insert.** `migrations/0006_add_updated_at_column.sql` made
 * `updated_at` `NOT NULL`, and the kit's `createUser` does not write it. Left
 * alone, every new account would fail to insert with a constraint violation —
 * visible immediately, but only on the one path that creates an account.
 *
 * ## Why `createUser` is overridden rather than inherited
 *
 * Two reasons, and the second is the dangerous one.
 *
 * The kit's version is `INSERT … ON CONFLICT DO NOTHING` plus a read-back
 * comparing the anchor row's id to its own generated one, returning `null` when
 * the insert was a silent no-op. That is what makes the opaque-anchor retry
 * safe, and it is inherited as-is.
 *
 * What it does *not* do is tolerate an id-less row, and this database has those
 * in every deployment created before migration 0011: `users.id` was added by
 * `ALTER TABLE ADD COLUMN` and backfilled by an `UPDATE`, so a row written
 * between the two — or on a database where the backfill ran against an
 * interrupted write — has `id IS NULL` and no `current_email`. D1 cannot alter a
 * column's nullability, so those rows are permanent.
 *
 * A plain `ON CONFLICT DO NOTHING` treats such a row as *conflicting* and
 * silently creates nothing; the read-back then returns `null`, and registration
 * takes the opaque-anchor retry — minting a **second account beside the first**
 * and orphaning every id-keyed row behind the original. The
 * `DO UPDATE … WHERE users.id IS NULL` clause below means a conflict can only
 * ever *adopt* an id-less row, so this path cannot fork a second identity for an
 * address that already has one.
 */
class UserDAO extends KitUserDAO {
  /**
   * Create an account, stamping the identity columns migration 0011 added and
   * the `updated_at` migration 0006 requires.
   *
   * Returns the account's id, or `null` when the insert was a silent no-op —
   * which the caller (`accountLookup`) reads as "retry with an opaque anchor".
   * That read-back is the whole safety property here; see the class note.
   */
  public override async createUser(input: { anchor: string; loginEmail: string; now: number }): Promise<string | null> {
    const anchor = input.anchor.toLowerCase();
    const loginEmail = input.loginEmail.toLowerCase();
    const id = newAccountId();
    await this.run(
      `
        INSERT INTO users (email, created_at, updated_at, id, current_email)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `,
      [anchor, input.now, input.now, id, loginEmail],
    );

    // Adopt rather than overwrite a row migration 0011 left id-less. Bounded by
    // the primary key on `email`, so it can never fan out; the `id IS NULL`
    // predicate is what stops it overwriting a real account that merely shares
    // the email — which the unique index on `current_email` cannot happen to,
    // but which the anchor primary key can if an opaque anchor were ever chosen
    // from the address.
    await this.run('UPDATE users SET id = ?, current_email = ?, updated_at = ? WHERE email = ? AND id IS NULL', [
      id,
      loginEmail,
      input.now,
      anchor,
    ]);

    const row = await this.getByEmail(anchor);
    return row?.id === id ? id : null;
  }

  /**
   * Anchor lookup — for legacy `*_email` values and cascade resolution.
   *
   * `users.email` keeps SQLite's BINARY collation (it is the primary key), so
   * the kit's lowercase-the-parameter rule is what makes this match: the column
   * is stored lowercased by every writer through this DAO.
   */
  public override async getByEmail(email: string): Promise<UserRow | null> {
    return this.first<UserRow>('SELECT * FROM users WHERE email = ? LIMIT 1', [email.toLowerCase()]);
  }

  /**
   * The account behind a stable key. `null` on a pre-0011 database.
   *
   * Overridden only to narrow the row type to this schema; the query is the
   * kit's, which is also the point — the alternative was a second
   * `SELECT * FROM users WHERE id = ?` that could drift from it.
   */
  public override async getById(id: string): Promise<UserRow | null> {
    return this.first<UserRow>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  }

  /**
   * Login-address lookup, case-insensitive.
   *
   * The kit's form is `current_email = ?` with a lowercased parameter, which
   * uses the unique index. This one spells it `lower(current_email) = lower(?)`,
   * which cannot. Both are correct *because every writer lowercases*, so the
   * difference is the index — kept here for one reason: migration 0011
   * deliberately leaves `current_email` NULL for mixed-case accounts it cannot
   * disambiguate, and the surrounding resolution path was written against this
   * shape. If the kit's indexed form is adopted here, the backfill gap has to
   * close first or those accounts become unfindable at login.
   */
  public override async getByCurrentEmail(email: string): Promise<UserRow | null> {
    return this.first<UserRow>('SELECT * FROM users WHERE lower(current_email) = lower(?) LIMIT 1', [email]);
  }

  /**
   * Keyed on the account id, so a stored language preference survives an
   * address change. A pre-0011 database has no `id`, so the anchor is the
   * fallback — chosen by the caller, not guessed here.
   *
   * Two literal statements rather than an interpolated column name: this layer
   * only ever varies SQL by an allow-listed identifier, and neither query needs
   * to vary at all.
   */
  public async updatePreferredLanguage(account: AccountIdentity, preferredLanguage: string | null): Promise<User | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const byId: boolean = account.id !== '';
    const key: string = byId ? account.id : account.anchorEmail;
    await this.run(byId ? UPDATE_BY_ID : UPDATE_BY_ANCHOR, [preferredLanguage, now, key]);
    const row: UserInternal | null = byId ? await this.getById(account.id) : await this.getByEmail(account.anchorEmail);
    return row ? UserDAO.toUser(row) : undefined;
  }

  /**
   * Row → domain mapping.
   *
   * `email` prefers `current_email` and falls back to the anchor, so a database
   * that has not run 0011 still maps to a usable address rather than a NULL.
   */
  public static toUser(row: UserInternal): User {
    return {
      id: row.id ?? '',
      email: normalizeEmail(row.current_email ?? row.email),
      anchorEmail: row.email,
      preferredLanguage: row.preferred_language ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { UserDAO };
export type { UserRow };
export { newAnchor, newAccountId } from '@rexezuge/identity';
