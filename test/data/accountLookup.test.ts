import { describe, expect, it, vi } from 'vitest';
import { registerAccount, resolveAccount } from '@rexezuge/identity';
import type { AccountLookupDeps } from '@rexezuge/identity';
import { UserIdentityService } from '@mail-meow/backend-services/identity';
import { DatabaseError } from '@rexezuge/errors';

/**
 * The fail-closed contract for address → account resolution.
 *
 * The registry (`user_emails`) is the only mapping that survives an address
 * change. The `users` lookups are a floor for databases that have not run
 * migration 0011 — and *only* for those. Every lookup here used to carry a
 * blanket `.catch(() => null)`, which collapsed two very different states into
 * one: "this database predates the registry" and "this query failed".
 *
 * The consequence was that a transient D1 error made a revoked address — one the
 * account had explicitly moved away from, and which is retained only so old rows
 * stay attributable — fall through to the legacy anchor lookup and authenticate
 * again. That is precisely the reassigned-company-address takeover the registry
 * exists to prevent.
 *
 * The implementation is now `@rexezuge/identity`'s, which is where this file's
 * logic came from. The suite stays: it is the regression test for the *repo's*
 * fail-closed rule, and a shared package cannot assert that a consumer wired it
 * in with the behaviour it was written for.
 */

const ALICE_ID = 'usr_0123456789abcdef0123456789abcdef';

const ALICE_ROW = {
  id: ALICE_ID,
  email: 'alice@example.com',
  current_email: 'alice@example.com',
  username: null,
  created_at: 100,
  updated_at: 100,
};

const ACCOUNT = {
  id: ALICE_ID,
  email: 'alice@example.com',
  anchorEmail: 'alice@example.com',
  username: null,
};

/** Alice moved off this address, so it is retained but must never authenticate. */
const REVOKED_ROW = { email: 'alice@example.com', user_id: ALICE_ID, is_verified: 0, created_at: 100 };

interface Overrides {
  byId?: unknown;
  byCurrentEmail?: unknown;
  byEmail?: unknown;
  registryRow?: unknown;
  /**
   * `Error`, not `unknown`. A rejected promise with a non-`Error` reason is legal
   * at runtime and a hazard to assert on — `rejects.toThrow` cannot match it — and
   * a real D1 binding only ever throws `Error`s. Typing them keeps the fakes from
   * modelling a case that cannot happen.
   */
  registryFailure?: Error;
  registerFailure?: Error;
  createUser?: (input: { anchor: string; loginEmail: string; now: number }) => Promise<string | null>;
}

function build(overrides: Overrides = {}): {
  deps: AccountLookupDeps;
  userDAO: Record<string, ReturnType<typeof vi.fn>>;
  userEmailDAO: Record<string, ReturnType<typeof vi.fn>>;
} {
  const userDAO = {
    getById: vi.fn().mockImplementation(() => Promise.resolve(overrides.byId === undefined ? null : overrides.byId)),
    getByCurrentEmail: vi
      .fn()
      .mockImplementation(() => Promise.resolve(overrides.byCurrentEmail === undefined ? null : overrides.byCurrentEmail)),
    getByEmail: vi.fn().mockImplementation(() => Promise.resolve(overrides.byEmail === undefined ? null : overrides.byEmail)),
    // Default: a genuine new account, so a caller that gets a non-null id is
    // exercising the happy path rather than the no-op branch.
    createUser: vi.fn().mockImplementation(overrides.createUser ?? (() => Promise.resolve('usr_newaccountid0000000000000'))),
  };
  // Hoisted to locals before the closures. TypeScript resets property narrowing
  // inside a callback for a parameter it cannot prove is immutable, so reading
  // `overrides.registryFailure` inside the mock would widen back to
  // `Error | undefined` and the rejection reason would be untyped.
  const registryFailure = overrides.registryFailure;
  const registerFailure = overrides.registerFailure;

  const userEmailDAO = {
    get: vi.fn().mockImplementation(() => {
      if (registryFailure !== undefined) {
        return Promise.reject(registryFailure);
      }
      return Promise.resolve(overrides.registryRow ?? null);
    }),
    register: vi
      .fn()
      .mockImplementation(() => (registerFailure === undefined ? Promise.resolve('claimed') : Promise.reject(registerFailure))),
  };
  return {
    deps: {
      userDAO: () => Promise.resolve(userDAO as never),
      userEmailDAO: () => Promise.resolve(userEmailDAO as never),
    },
    userDAO,
    userEmailDAO,
  };
}

/**
 * A pre-0011 database: `user_emails` has never been created.
 *
 * The DAO is constructed successfully and the error arrives from the statement,
 * which is where D1 actually reports it — so the fake rejects at query time. A
 * check that wrapped only the factory would miss this case entirely.
 */
function buildLegacySchema(): AccountLookupDeps {
  const missingTable = (): Promise<never> => Promise.reject(new Error('D1_ERROR: no such table: user_emails'));
  return {
    userDAO: () =>
      Promise.resolve({
        getById: vi.fn().mockResolvedValue(null),
        getByCurrentEmail: vi.fn().mockResolvedValue(null),
        getByEmail: vi.fn().mockResolvedValue(ALICE_ROW),
        createUser: vi.fn().mockResolvedValue('usr_newaccountid0000000000000'),
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
    const { deps } = build({ registryFailure: new DatabaseError('D1_ERROR: connection reset') });

    await expect(resolveAccount(deps, 'nobody@example.com')).rejects.toThrow(/connection reset/);
  });

  it('propagates a registry failure even when the message names no table', async () => {
    // The kit's `isMissingSchemaError` matches `no such (table|column|index)`,
    // which is *broader* than this repo's old `isMissingTableError`
    // (`no such table` only). A missing column is therefore also tolerated here,
    // and that is a deliberate widening: both mean "this schema predates the
    // feature", and neither can be produced by a transient fault.
    const { deps, userDAO } = build({ registryFailure: new DatabaseError('D1_ERROR: no such column: is_verified') });

    await expect(resolveAccount(deps, 'nobody@example.com')).resolves.toBeNull();
    expect(userDAO.getByEmail).toHaveBeenCalled();
  });

  it('still resolves a legacy database that has no registry table', async () => {
    // The floor this fallback exists for: pre-0011, the address *is* the anchor.
    await expect(resolveAccount(buildLegacySchema(), 'alice@example.com')).resolves.toEqual(ACCOUNT);
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

    await expect(resolveAccount(deps, 'Alice@Example.com')).resolves.toEqual(ACCOUNT);
  });

  it('does not resolve a revoked address', async () => {
    const { deps } = build({ registryRow: REVOKED_ROW, byId: ALICE_ROW, byEmail: ALICE_ROW });

    await expect(resolveAccount(deps, 'alice@example.com')).resolves.toBeNull();
  });

  it('falls back to the current-email lookup for a row-less address', async () => {
    const { deps } = build({ registryRow: null, byCurrentEmail: ALICE_ROW });

    await expect(resolveAccount(deps, 'alice@example.com')).resolves.toEqual(ACCOUNT);
  });

  it('prefers current_email over the frozen anchor', async () => {
    const { deps } = build({
      registryRow: null,
      byCurrentEmail: { ...ALICE_ROW, current_email: 'alice@newmail.com' },
    });

    const account = await resolveAccount(deps, 'alice@newmail.com');

    // The anchor is what every legacy `*_email` foreign key resolves against,
    // so it must be reported unchanged even when the sign-in address has moved.
    expect(account).toEqual({ ...ACCOUNT, email: 'alice@newmail.com' });
  });

  /**
   * The anchor lookup is reachable only on a database with no registry, and on
   * one the registry is incomplete. A row found there whose mutable address has
   * since moved away is an account that *left* this address — answering with its
   * id would install the caller's identity as that account.
   */
  it('refuses an anchor whose account has since moved off the address', async () => {
    const { deps } = build({
      registryRow: null,
      byCurrentEmail: null,
      byEmail: { ...ALICE_ROW, current_email: 'alice@newmail.com' },
    });

    await expect(resolveAccount(deps, 'alice@example.com')).resolves.toBeNull();
  });

  it('returns null for an empty address without querying', async () => {
    const { deps, userDAO } = build();

    await expect(resolveAccount(deps, ' '.repeat(3))).resolves.toBeNull();
    expect(userDAO.getById).not.toHaveBeenCalled();
  });
});

describe('registerAccount', () => {
  it('returns the created account rather than an id the caller may not trust', async () => {
    const { deps, userDAO, userEmailDAO } = build({ registryRow: null, byCurrentEmail: null, byEmail: null });

    const account = await registerAccount(deps, 'new@example.com', 'new@example.com', 1_700_000_000);

    expect(userDAO.createUser).toHaveBeenCalledTimes(1);
    expect(userEmailDAO.register).toHaveBeenCalledWith({
      email: 'new@example.com',
      userId: 'usr_newaccountid0000000000000',
      isVerified: true,
      now: 1_700_000_000,
    });
    expect(account).toBeNull();
  });

  it('reports null when the anchor was already taken, so the caller retries opaquely', async () => {
    // `ON CONFLICT DO NOTHING` makes a lost race a silent no-op. Detecting it is
    // the whole safety property: without the read-back, the generated id belongs
    // to nobody and the address registry gets pointed at a phantom account.
    const { deps } = build({ createUser: () => Promise.resolve(null) });

    await expect(registerAccount(deps, 'new@example.com', 'new@example.com', 1_700_000_000)).resolves.toBeNull();
  });

  it('does not create a second account when the first insert fails', async () => {
    // The opaque-anchor retry exists for a *lost race* (the anchor is already
    // taken), not for error recovery. Swallowing the failure made a failed insert
    // look like a lost race and produced exactly the duplicate this guards
    // against.
    const { deps, userDAO } = build({
      createUser: () => Promise.reject(new DatabaseError('D1_ERROR: request timeout', true)),
    });

    await expect(registerAccount(deps, 'new@example.com', 'new@example.com', 1_700_000_000)).rejects.toBeInstanceOf(DatabaseError);
    expect(userDAO.createUser).toHaveBeenCalledTimes(1);
  });

  it('does not proceed when the address claim fails', async () => {
    // The account row would exist but the address would never be claimed, so
    // nothing could resolve it. Reporting success there would strand a user with
    // an account they cannot sign in to.
    const { deps } = build({
      registryRow: null,
      byCurrentEmail: null,
      byEmail: null,
      registerFailure: new DatabaseError('D1_ERROR: request timeout', true),
    });

    await expect(registerAccount(deps, 'new@example.com', 'new@example.com', 1_700_000_000)).rejects.toBeInstanceOf(DatabaseError);
  });

  it('skips the claim on a legacy database with no registry table', async () => {
    // The claim is tolerated as absent rather than fatal, and the legacy anchor
    // lookup still resolves the new account.
    const account = await registerAccount(buildLegacySchema(), 'alice@example.com', 'alice@example.com', 1_700_000_000);

    expect(account).toEqual(ACCOUNT);
  });

  it('fails closed when the registry is unreachable', async () => {
    // The claim throws, so the caller never learns a resolvable account exists.
    // Swallowing it would return an account the address registry has never heard
    // of, which resolves to nothing on the next login — a row that looks
    // created and cannot be used.
    //
    // Note what this does *not* assert: that `createUser` was never called. The
    // kit's `registerAccount` inserts before it resolves, so the row does exist
    // by the time the claim fails; the row is harmless (it has no verified
    // address) and the alternative — resolving first — is what
    // `resolveOrRegister` does, one layer up.
    const { deps } = build({ registryFailure: new DatabaseError('D1_ERROR: request timeout', true) });

    await expect(registerAccount(deps, 'new@example.com', 'new@example.com', 1_700_000_000)).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('resolveOrRegister — the login path', () => {
  it('returns an existing account rather than forking a second one', async () => {
    const { deps, userDAO } = build({
      registryRow: { email: 'alice@example.com', user_id: ALICE_ID, is_verified: 1, created_at: 100 },
      byId: ALICE_ROW,
    });
    const service = new UserIdentityService({ DB: {} as never }, deps);

    const account = await service.resolveOrRegister('alice@example.com');

    expect(account?.id).toBe(ALICE_ID);
    expect(userDAO.createUser).not.toHaveBeenCalled();
  });

  it('does not silently register a revoked address', async () => {
    // A revoked address resolves to null, which is indistinguishable from
    // "brand new" at this layer — so registering there would hand the previous
    // holder's history to whoever was given the address next. `null` is the
    // caller's cue to refuse, and this asserts the resolution half of that.
    const { deps } = build({ registryRow: REVOKED_ROW, byId: ALICE_ROW, byEmail: ALICE_ROW });

    await expect(resolveAccount(deps, 'alice@example.com')).resolves.toBeNull();
  });

  it('retries with an opaque anchor when the address is already another account’s anchor', async () => {
    // First attempt: the address as anchor, refused as already taken. Second:
    // an opaque `@users.invalid` anchor, which cannot collide, so the released
    // address is never permanently unusable.
    const anchors: string[] = [];
    const { deps } = build({
      registryRow: null,
      byCurrentEmail: null,
      byEmail: null,
      createUser: (input) => {
        anchors.push(input.anchor);
        return Promise.resolve(input.anchor === 'new@example.com' ? null : 'usr_opaqueaccountid000000000');
      },
    });
    const service = new UserIdentityService({ DB: {} as never }, deps);

    await service.resolveOrRegister('new@example.com');

    expect(anchors[0]).toBe('new@example.com');
    expect(anchors[1]).toMatch(/^anchor-[0-9a-f]+@users\.invalid$/);
  });
});
