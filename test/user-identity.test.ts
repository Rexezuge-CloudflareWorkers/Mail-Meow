import { describe, expect, it, vi } from 'vitest';
import { UserIdentityService } from '@mail-meow/backend-services/identity';
import { ConflictError } from '@mail-meow/backend-errors';

/**
 * Unit coverage for the address-change path.
 *
 * The two invariants that matter and are easy to lose:
 *   * claim → move → revoke, in that order, so the account is never locked out;
 *   * `users.email` (the frozen anchor) is never written.
 *
 * The integration suite proves the SQL against a real D1; this proves the
 * ordering and the refusals, which no single-database test can observe.
 */

const NOW = 1_700_000_000;

const ALICE_ROW = {
  id: 'usr_0123456789abcdef0123456789abcdef',
  email: 'old@example.com',
  current_email: 'old@example.com',
  preferred_language: 'de',
  created_at: 100,
  updated_at: 200,
};

function build(options: { row?: unknown; verified?: unknown } = {}) {
  const row = options.row === undefined ? ALICE_ROW : options.row;
  const userDAO = {
    getById: vi.fn().mockResolvedValue(row),
    getByEmail: vi.fn().mockResolvedValue(row),
    getByCurrentEmail: vi.fn().mockResolvedValue(row),
    setCurrentEmail: vi.fn().mockResolvedValue(undefined),
  };
  const userEmailDAO = {
    get: vi.fn().mockResolvedValue(options.verified ?? null),
    register: vi.fn().mockResolvedValue('claimed'),
    resolveVerified: vi.fn().mockResolvedValue(null),
    revokeAllVerified: vi.fn().mockResolvedValue(undefined),
    listByUserId: vi.fn().mockResolvedValue([]),
  };
  const service = new UserIdentityService({
    userDAO: () => Promise.resolve(userDAO as never),
    userEmailDAO: () => Promise.resolve(userEmailDAO as never),
  });
  return { service, userDAO, userEmailDAO };
}

describe('setPrimaryEmail', () => {
  it('claims, then moves, then revokes — in that order', async () => {
    const { service, userDAO, userEmailDAO } = build();
    const order: string[] = [];
    userEmailDAO.register.mockImplementation(async () => {
      order.push('claim');
      return 'claimed' as const;
    });
    userDAO.setCurrentEmail.mockImplementation(async () => {
      order.push('move');
    });
    userEmailDAO.revokeAllVerified.mockImplementation(async () => {
      order.push('revoke');
    });

    await service.setPrimaryEmail(ALICE_ROW.id, 'new@example.com', NOW);

    // Claiming first means there is only a brief window where both addresses
    // authenticate. Revoking first opens a window where neither does, locking
    // the user out of their own account.
    expect(order).toEqual(['claim', 'move', 'revoke']);
    expect(userEmailDAO.register).toHaveBeenCalledWith({ email: 'new@example.com', userId: ALICE_ROW.id, isVerified: true, now: NOW });
    expect(userEmailDAO.revokeAllVerified).toHaveBeenCalledWith(ALICE_ROW.id, 'new@example.com');
  });

  it('never writes the frozen anchor', async () => {
    const { service, userDAO } = build();

    await service.setPrimaryEmail(ALICE_ROW.id, 'new@example.com', NOW);

    // `setCurrentEmail` is the only write, and it targets `current_email` by id.
    // Updating `email` would cascade the user's applications, API keys, and
    // OAuth2 sessions away.
    expect(userDAO.setCurrentEmail).toHaveBeenCalledWith(ALICE_ROW.id, 'new@example.com', NOW);
    expect(userDAO.setCurrentEmail.mock.calls.flat()).not.toContain(ALICE_ROW.email);
  });

  it('rejects an address already verified for a different account', async () => {
    const { service, userEmailDAO } = build();
    userEmailDAO.resolveVerified.mockResolvedValue({ email: 'taken@example.com', user_id: 'usr_other', is_verified: 1, created_at: 1 });

    // Without this check, anyone could claim an address and inherit its account.
    await expect(service.setPrimaryEmail(ALICE_ROW.id, 'taken@example.com', NOW)).rejects.toBeInstanceOf(ConflictError);
    expect(userEmailDAO.register).not.toHaveBeenCalled();
    expect(userEmailDAO.revokeAllVerified).not.toHaveBeenCalled();
  });

  it("allows re-claiming the account's own current address", async () => {
    const { service, userDAO, userEmailDAO } = build();
    userEmailDAO.resolveVerified.mockResolvedValue({ email: 'old@example.com', user_id: ALICE_ROW.id, is_verified: 1, created_at: 1 });

    const account = await service.setPrimaryEmail(ALICE_ROW.id, 'OLD@example.com', NOW);

    // A no-op change must not revoke the account's only verified address.
    expect(account).toEqual({ id: ALICE_ROW.id, email: 'old@example.com', anchorEmail: ALICE_ROW.email });
    expect(userEmailDAO.revokeAllVerified).not.toHaveBeenCalled();
    expect(userDAO.setCurrentEmail).not.toHaveBeenCalled();
  });

  it('rejects an unknown account rather than creating one', async () => {
    const { service } = build({ row: null });
    await expect(service.setPrimaryEmail('usr_missing', 'new@example.com', NOW)).rejects.toThrow(/User not found/);
  });

  it('rejects an empty address', async () => {
    const { service } = build();
    await expect(service.setPrimaryEmail(ALICE_ROW.id, '   ', NOW)).rejects.toThrow(/Invalid email/);
  });

  it('takes effect on the current request, not the next one', async () => {
    // The service memoizes per request scope. A stale entry would mean a
    // revoked address still resolved after the change, within the same request.
    const { service, userEmailDAO } = build();
    await service.resolveAccount('old@example.com');
    expect(userEmailDAO.get).toHaveBeenCalledWith('old@example.com');

    userEmailDAO.get.mockResolvedValue({ email: 'new@example.com', user_id: ALICE_ROW.id, is_verified: 1, created_at: 1 });
    await service.setPrimaryEmail(ALICE_ROW.id, 'new@example.com', NOW);

    // The new address resolves to this account without another round trip.
    await expect(service.resolveAccount('new@example.com')).resolves.toEqual({
      id: ALICE_ROW.id,
      email: 'new@example.com',
      anchorEmail: ALICE_ROW.email,
    });
  });
});

describe('resolveAccount', () => {
  it('does not resolve a revoked address', async () => {
    // The account moved off this address. Falling through to the anchor lookup
    // would let a reassigned address keep authenticating the previous holder.
    const { service } = build({ verified: { email: 'old@example.com', user_id: ALICE_ROW.id, is_verified: 0, created_at: 1 } });
    await expect(service.resolveAccount('old@example.com')).resolves.toBeNull();
  });

  it('resolves a verified address through the registry to its id', async () => {
    const { service } = build({ verified: { email: 'old@example.com', user_id: ALICE_ROW.id, is_verified: 1, created_at: 1 } });
    await expect(service.resolveAccount('old@example.com')).resolves.toEqual({
      id: ALICE_ROW.id,
      email: 'old@example.com',
      anchorEmail: ALICE_ROW.email,
    });
  });

  it('memoizes an address for the request', async () => {
    const { service, userEmailDAO } = build({
      verified: { email: 'old@example.com', user_id: ALICE_ROW.id, is_verified: 1, created_at: 1 },
    });
    await service.resolveAccount('Old@Example.com');
    await service.resolveAccount('old@example.com');
    // Case-folded to the same key, and the auth path resolves repeatedly.
    expect(userEmailDAO.get).toHaveBeenCalledTimes(1);
  });

  it('returns null for an empty address without querying', async () => {
    const { service, userEmailDAO } = build();
    await expect(service.resolveAccount('  ')).resolves.toBeNull();
    expect(userEmailDAO.get).not.toHaveBeenCalled();
  });
});

describe('linkVerifiedEmail', () => {
  it('attaches a proven address without making it the sign-in address', async () => {
    const { service, userDAO, userEmailDAO } = build();

    await service.linkVerifiedEmail(ALICE_ROW.id, 'Alias@Example.com', NOW);

    expect(userEmailDAO.register).toHaveBeenCalledWith({ email: 'alias@example.com', userId: ALICE_ROW.id, isVerified: true, now: NOW });
    // Ops path only: the account keeps signing in with the address it has.
    expect(userDAO.setCurrentEmail).not.toHaveBeenCalled();
  });

  it('refuses an address already claimed', async () => {
    const { service, userEmailDAO } = build();
    userEmailDAO.register.mockResolvedValue('already-claimed');
    await expect(service.linkVerifiedEmail(ALICE_ROW.id, 'taken@example.com', NOW)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('listAddresses', () => {
  it('reports every address with its verification state', async () => {
    const { service, userEmailDAO } = build();
    userEmailDAO.listByUserId.mockResolvedValue([
      { email: 'new@example.com', user_id: ALICE_ROW.id, is_verified: 1, created_at: 300 },
      { email: 'old@example.com', user_id: ALICE_ROW.id, is_verified: 0, created_at: 100 },
    ]);

    await expect(service.listAddresses(ALICE_ROW.id)).resolves.toEqual([
      { email: 'new@example.com', isVerified: true },
      // Retained for attribution, no longer able to authenticate.
      { email: 'old@example.com', isVerified: false },
    ]);
  });
});
