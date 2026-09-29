import { describe, expect, it, vi } from 'vitest';
import { registerAccount, resolveAccount } from '@mail-meow/backend-services/user/accountLookup';
import type { AccountLookupDeps } from '@mail-meow/backend-services/user/accountLookup';
import { DatabaseError } from '@mail-meow/backend-errors';

/**
 * The fail-closed contract for address → account resolution.
 *
 * The registry (`user_emails`) is the only mapping that survives an address
 * change. The pre-0011 `users` lookups are a floor for databases that have not
 * run migration 0011 — and *only* for those. Every lookup here used to carry a
 * blanket `.catch(() => null)`, which collapsed two very different states into
 * one: "this database predates the registry" and "this query failed".
 *
 * The consequence was that a transient D1 error made a revoked address — one
 * the account had explicitly moved away from, and which is retained only so old
 * rows stay attributable — fall through to the legacy anchor lookup and
 * authenticate again. That is precisely the reassigned-company-address takeover
 * the registry exists to prevent.
 */

const ALICE_ID = 'usr_0123456789abcdef0123456789abcdef';

const ALICE_ROW = {
  id: ALICE_ID,
  email: 'alice@example.com',
  current_email: 'alice@example.com',
  preferred_language: null,
  created_at: 100,
  updated_at: 100,
};

/** Alice moved off this address, so it is retained but must never authenticate. */
const REVOKED_ROW = { email: 'alice@example.com', user_id: ALICE_ID, is_verified: 0, created_at: 100 };

interface Overrides {
  byId?: unknown;
  byCurrentEmail?: unknown;
  byEmail?: unknown;
  registryRow?: unknown;
  registryFailure?: unknown;
  registerFailure?: unknown;
}

function build(overrides: Overrides = {}): { deps: AccountLookupDeps; userDAO: Record<string, ReturnType<typeof vi.fn>> } {
  const userDAO = {
    getById: vi.fn().mockImplementation(() => Promise.resolve(overrides.byId === undefined ? null : overrides.byId)),
    getByCurrentEmail: vi
      .fn()
      .mockImplementation(() => Promise.resolve(overrides.byCurrentEmail === undefined ? null : overrides.byCurrentEmail)),
    getByEmail: vi.fn().mockImplementation(() => Promise.resolve(overrides.byEmail === undefined ? null : overrides.byEmail)),
    createUser: vi.fn().mockResolvedValue(undefined),
  };
  const userEmailDAO = {
    get: vi.fn().mockImplementation(() => {
      if (overrides.registryFailure !== undefined) {
        return Promise.reject(overrides.registryFailure);
      }
      return Promise.resolve(overrides.registryRow ?? null);
    }),
    register: vi
      .fn()
      .mockImplementation(() =>
        overrides.registerFailure === undefined ? Promise.resolve('claimed') : Promise.reject(overrides.registerFailure),
      ),
  };
  return {
    deps: {
      userDAO: () => Promise.resolve(userDAO as never),
      userEmailDAO: () => Promise.resolve(userEmailDAO as never),
    },
    userDAO,
  };
}

/**
 * A pre-0011 database: `user_emails` has never been created.
 *
 * The DAO is constructed successfully and the error arrives from the statement,
 * which is where D1 actually reports it — so the fake rejects at query time.
 */
function buildLegacySchema(): AccountLookupDeps {
  const missingTable = (): Promise<never> => Promise.reject(new Error('D1_ERROR: no such table: user_emails'));
  return {
    userDAO: () =>
      Promise.resolve({
        getById: vi.fn().mockResolvedValue(null),
        // 0011-only; absent on a legacy database, exactly as the code guards for.
        getByEmail: vi.fn().mockResolvedValue(ALICE_ROW),
        createUser: vi.fn().mockResolvedValue(undefined),
      } as never),
    userEmailDAO: () =>
      Promise.resolve({
        get: vi.fn().mockImplementation(missingTable),
        register: vi.fn().mockImplementation(missingTable),
      } as never),
  };
}

describe('resolveAccount — registry failures', () => {
  it('does not re-resolve a revoked address when the registry read fails', async () => {
    // The security case. `users` still holds alice's frozen anchor, so the
    // legacy fallback would happily return her account. Failing open here hands
    // a released address back to the previous holder.
    const { deps } = build({
      registryFailure: new DatabaseError('D1_ERROR: request timeout', true),
      byCurrentEmail: null,
      byEmail: ALICE_ROW,
    });

    await expect(resolveAccount(deps, 'alice@example.com')).rejects.toBeInstanceOf(DatabaseError);
  });

  it('propagates a registry failure even when the address is unknown', async () => {
    // The fallback would return null anyway, but resolving null would report
    // "not signed up" for a database that is merely unreachable — and the auth
    // middleware cannot tell those apart.
    const { deps } = build({ registryFailure: new Error('D1_ERROR: connection reset') });

    await expect(resolveAccount(deps, 'nobody@example.com')).rejects.toBeInstanceOf(DatabaseError);
  });

  it('surfaces a non-DatabaseError as a DatabaseError so the route mapper can see it', async () => {
    // A bare Error would be masked as a generic 500 with no attribution; a
    // DatabaseError keeps the retry verdict the background layer relies on.
    const { deps } = build({ registryFailure: new TypeError('boom') });

    const error: unknown = await resolveAccount(deps, 'nobody@example.com').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).message).toMatch(/user email registry/);
  });

  it('still resolves a legacy database that has no registry table', async () => {
    // The floor this fallback exists for: pre-0011, the address *is* the anchor.
    await expect(resolveAccount(buildLegacySchema(), 'alice@example.com')).resolves.toEqual({
      id: ALICE_ID,
      email: 'alice@example.com',
      anchorEmail: 'alice@example.com',
    });
  });

  it('propagates a failure from the users lookup itself', async () => {
    // The fallback reads are no more trustworthy than the registry read; a
    // silent null here would look like "no such user".
    const { deps } = build({
      registryRow: null,
      byCurrentEmail: null,
      byEmail: Promise.reject(new DatabaseError('D1_ERROR: database is locked', true)),
    });

    await expect(resolveAccount(deps, 'alice@example.com')).rejects.toBeInstanceOf(DatabaseError);
  });

  it('propagates a failure resolving a verified address to its account', async () => {
    const { deps } = build({
      registryRow: { email: 'alice@example.com', user_id: ALICE_ID, is_verified: 1, created_at: 100 },
      byId: Promise.reject(new DatabaseError('D1_ERROR: request timeout', true)),
    });

    await expect(resolveAccount(deps, 'alice@example.com')).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('resolveAccount — registry hits', () => {
  it('resolves a verified address through the registry to its account id', async () => {
    const { deps } = build({
      registryRow: { email: 'alice@example.com', user_id: ALICE_ID, is_verified: 1, created_at: 100 },
      byId: ALICE_ROW,
    });

    await expect(resolveAccount(deps, 'Alice@Example.com')).resolves.toEqual({
      id: ALICE_ID,
      email: 'alice@example.com',
      anchorEmail: 'alice@example.com',
    });
  });

  it('does not resolve a revoked address', async () => {
    const { deps } = build({ registryRow: REVOKED_ROW, byId: ALICE_ROW, byEmail: ALICE_ROW });

    await expect(resolveAccount(deps, 'alice@example.com')).resolves.toBeNull();
  });

  it('falls back to the anchor lookup for a row-less address', async () => {
    const { deps } = build({ registryRow: null, byCurrentEmail: ALICE_ROW });

    await expect(resolveAccount(deps, 'alice@example.com')).resolves.toEqual({
      id: ALICE_ID,
      email: 'alice@example.com',
      anchorEmail: 'alice@example.com',
    });
  });

  it('prefers current_email over the frozen anchor', async () => {
    const { deps } = build({
      registryRow: null,
      byCurrentEmail: { ...ALICE_ROW, current_email: 'alice@newmail.com' },
    });

    const account = await resolveAccount(deps, 'alice@newmail.com');

    // The anchor is what every legacy `*_email` foreign key resolves against,
    // so it must be reported unchanged even when the sign-in address has moved.
    expect(account).toEqual({ id: ALICE_ID, email: 'alice@newmail.com', anchorEmail: 'alice@example.com' });
  });

  it('returns null for an empty address without querying', async () => {
    const { deps, userDAO } = build();

    await expect(resolveAccount(deps, '   ')).resolves.toBeNull();
    expect(userDAO.getById).not.toHaveBeenCalled();
  });
});

describe('registerAccount', () => {
  it('returns the existing account rather than forking a second one', async () => {
    const { deps, userDAO } = build({
      registryRow: { email: 'alice@example.com', user_id: ALICE_ID, is_verified: 1, created_at: 100 },
      byId: ALICE_ROW,
    });

    const account = await registerAccount(deps, 'alice@example.com', 1_700_000_000);

    expect(account?.id).toBe(ALICE_ID);
    expect(userDAO.createUser).not.toHaveBeenCalled();
  });

  it('does not create a second account when the first insert fails', async () => {
    // The retry below exists for a *lost race* (the anchor is already taken),
    // not for error recovery. Swallowing the failure made a failed insert look
    // like a lost race and produced exactly the duplicate this guards against.
    const { deps, userDAO } = build({ registryRow: null, byCurrentEmail: null, byEmail: null });
    userDAO.createUser.mockRejectedValueOnce(new DatabaseError('D1_ERROR: request timeout', true));

    await expect(registerAccount(deps, 'new@example.com', 1_700_000_000)).rejects.toBeInstanceOf(DatabaseError);
    expect(userDAO.createUser).toHaveBeenCalledTimes(1);
  });

  it('does not proceed when the address claim fails', async () => {
    // The account row would exist but the address would never be claimed, so
    // nothing could resolve it. Reporting success there would strand a user
    // with an account they cannot sign in to.
    const { deps } = build({
      registryRow: null,
      byCurrentEmail: null,
      byEmail: null,
      registerFailure: new DatabaseError('D1_ERROR: request timeout', true),
    });

    await expect(registerAccount(deps, 'new@example.com', 1_700_000_000)).rejects.toBeInstanceOf(DatabaseError);
  });

  it('registers the account on a legacy database with no registry table', async () => {
    // The claim is skipped rather than failing, and the legacy anchor lookup
    // still resolves the new account.
    const account = await registerAccount(buildLegacySchema(), 'alice@example.com', 1_700_000_000);

    expect(account?.id).toBe(ALICE_ID);
  });

  it('fails closed when the registry is unreachable', async () => {
    // Creating an account we cannot then resolve would leave a row nothing can
    // log into, and would claim the address in the process.
    const { deps, userDAO } = build({ registryFailure: new DatabaseError('D1_ERROR: request timeout', true) });

    await expect(registerAccount(deps, 'new@example.com', 1_700_000_000)).rejects.toBeInstanceOf(DatabaseError);
    expect(userDAO.createUser).not.toHaveBeenCalled();
  });

  it('returns null for an empty address without touching the database', async () => {
    const { deps, userDAO } = build();

    await expect(registerAccount(deps, '  ', 1_700_000_000)).resolves.toBeNull();
    expect(userDAO.createUser).not.toHaveBeenCalled();
  });
});
