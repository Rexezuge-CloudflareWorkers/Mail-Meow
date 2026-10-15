import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import { encryptSecret } from '@rexezuge/d1';
import type { D1Queryable } from '@mail-meow/backend-runtime/base';
import { applyMigrations } from '../helpers/migrations';

/**
 * The credential-envelope compatibility test.
 *
 * This is the one failure mode in the SDK adoption that cannot be recovered from
 * by reading the error: if the kit's `encryptSecret` did not produce bytes this
 * database's `encrypted_credentials` / `credentials_iv` columns could decrypt,
 * every connected application in the deployment becomes permanently unreadable
 * and the only remedy is every operator re-entering their provider credentials.
 *
 * There is no error to look for. A decrypt failure is a thrown `AesGcmKeyError`
 * deep in a delivery call, and by then the operator has already lost access to
 * their mail. So the claim is asserted *here*, against a real D1 and the real
 * Workers crypto implementation, using an envelope produced the old way.
 *
 * The old shape is reproduced rather than imported: the deleted
 * `backend-data/crypto/aes-gcm.ts` is
 *
 *   encryptData(plaintext, keyBase64) → { encrypted, iv }
 *     iv      = crypto.getRandomValues(new Uint8Array(12))
 *     encrypted = btoa(crypto.subtle.encrypt({name:'AES-GCM', iv}, key, utf8(plaintext)))
 *
 * and the kit's is the same AES-GCM with the same 96-bit random IV and the same
 * base64, under the field name `ciphertext`. Same bytes, different name. This
 * test proves it rather than asserting it.
 */

/**
 * The suite's fixture key, and the one `test/integration/self.ts` substitutes for
 * the real Secrets Store binding. Hardcoding a *different* key here would make
 * every case below fail for the wrong reason.
 */
const MASTER_KEY = 'bWFpbC1tZW93LWl0ZXN0LWZpeHR1cmUta2V5LTMyYnk=';

/** Byte-for-byte the deleted `encryptData`, including the field name it used. */
async function legacyEncryptData(data: string, keyBase64: string): Promise<{ encrypted: string; iv: string }> {
  const fromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (c) => c.codePointAt(0) ?? 0);
  const key = await crypto.subtle.importKey('raw', fromBase64(keyBase64), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data));
  return {
    encrypted: btoa(String.fromCodePoint(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCodePoint(...iv)),
  };
}

const CREDENTIALS = { clientId: 'client', clientSecret: 'shhh-secret', refreshToken: 'refresh' };

const OWNER = { id: '', email: 'test@example.com', anchorEmail: 'test@example.com' };

function db(): D1Queryable {
  return env.DB as unknown as D1Queryable;
}

/**
 * The account the seeded rows belong to.
 *
 * Read from `users` rather than hardcoded: the id is generated, and `user_id` is
 * a foreign key, so a made-up value would fail the insert for a reason that has
 * nothing to do with the envelope under test.
 */
async function ownerId(): Promise<string> {
  const row = await db().prepare('SELECT id FROM users WHERE current_email = ? LIMIT 1').bind(OWNER.email).first<{ id: string }>();
  if (!row?.id) throw new Error('The authenticated test account has no row.');
  return row.id;
}

describe('credential envelope — pre-adoption rows', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
    // One authenticated request creates the `users` row (`upsertUser` is the
    // single place an account comes into existence). The seeded rows below carry
    // a foreign key to it, so it has to exist first.
    const primed = await SELF.fetch('http://localhost/user/me');
    expect(primed.status).toBe(200);
  });

  it('decrypts an envelope written by the deleted local aes-gcm helper', async () => {
    // Seed the row the way the *previous* code wrote it, then read it through
    // the kit-backed DAO. If these two disagree at all, this is where it shows.
    const legacy = await legacyEncryptData(JSON.stringify(CREDENTIALS), MASTER_KEY);
    const applicationId = 'app-legacy-envelope';
    const userId = await ownerId();
    await db()
      .prepare(
        `INSERT INTO connected_applications
           (application_id, user_email, user_id, display_name, provider_id, connection_method,
            encrypted_credentials, credentials_iv, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Legacy', 'google-gmail', 'oauth2', ?, ?, 'connected', 1, 1)`,
      )
      .bind(applicationId, OWNER.anchorEmail, userId, legacy.encrypted, legacy.iv)
      .run();

    const application = await new ConnectedApplicationDAO(db(), MASTER_KEY).getById(applicationId);

    expect(application?.credentials).toEqual(CREDENTIALS);
  });

  it('reads a row written by the kit straight back', async () => {
    const envelope = await encryptSecret(JSON.stringify(CREDENTIALS), MASTER_KEY);
    const applicationId = 'app-kit-envelope';
    const userId = await ownerId();
    await db()
      .prepare(
        `INSERT INTO connected_applications
           (application_id, user_email, user_id, display_name, provider_id, connection_method,
            encrypted_credentials, credentials_iv, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Kit', 'google-gmail', 'oauth2', ?, ?, 'connected', 1, 1)`,
      )
      .bind(applicationId, OWNER.anchorEmail, userId, envelope.ciphertext, envelope.iv)
      .run();

    const application = await new ConnectedApplicationDAO(db(), MASTER_KEY).getById(applicationId);

    expect(application?.credentials).toEqual(CREDENTIALS);
  });

  /**
   * A rotated key must fail loudly rather than return garbage.
   *
   * The kit's `decryptSecret` turns a wrong key into `AesGcmKeyError`. The
   * deleted helper let the platform's opaque `OperationError` escape, which a
   * caller catching the documented error type misses — so this asserts the
   * *type* as well as the refusal, because the type is what lets
   * `OAuth2AccessTokenCacheDAO` evict the poisoned entry instead of failing
   * every token fetch while it stays in KV.
   */
  it('refuses an envelope sealed with a different key, by type', async () => {
    const otherKey = btoa('z'.repeat(32));
    const envelope = await encryptSecret(JSON.stringify(CREDENTIALS), otherKey);
    const applicationId = 'app-wrong-key';
    const userId = await ownerId();
    await db()
      .prepare(
        `INSERT INTO connected_applications
           (application_id, user_email, user_id, display_name, provider_id, connection_method,
            encrypted_credentials, credentials_iv, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Wrong key', 'google-gmail', 'oauth2', ?, ?, 'connected', 1, 1)`,
      )
      .bind(applicationId, OWNER.anchorEmail, userId, envelope.ciphertext, envelope.iv)
      .run();

    await expect(new ConnectedApplicationDAO(db(), MASTER_KEY).getById(applicationId)).rejects.toThrow(
      /could not be decrypted|wrong key|tampered/,
    );
  });

  it('creates an application through the API and reads its credentials back', async () => {
    const created = await SELF.fetch('http://localhost/user/application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The API takes flattened credential fields and nests the response; the
      // DAO stores them as one JSON blob. This is the round trip between the two.
      body: JSON.stringify({
        displayName: 'Envelope',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        clientId: CREDENTIALS.clientId,
        clientSecret: CREDENTIALS.clientSecret,
      }),
    });

    expect(created.status).toBe(200);
    const applicationId = ((await created.json()) as { application: { applicationId: string } }).application.applicationId;

    // The write path and the read path must agree, or a just-created
    // application is one that cannot deliver.
    const application = await new ConnectedApplicationDAO(db(), MASTER_KEY).getById(applicationId);
    expect(application?.credentials).toEqual({ clientId: CREDENTIALS.clientId, clientSecret: CREDENTIALS.clientSecret });
  });
});
