import type { UserDAO, UserEmailDAO } from '@mail-meow/backend-data/dao';
import { BadRequestError, ConflictError } from '@mail-meow/backend-errors';
import type { AccountIdentity } from '@mail-meow/shared/model';
import { normalizeEmail, TimestampUtil } from '@mail-meow/shared/utils';
import { resolveAccount } from '../user/accountLookup';

interface UserIdentityDeps {
  userDAO: () => Promise<UserDAO>;
  userEmailDAO: () => Promise<UserEmailDAO>;
}

/**
 * Resolves an address to an account and moves an account's sign-in address.
 *
 * The account id is the identity; the address is a mutable attribute of it.
 * Instances are per-request-scope and memoize address lookups, since the
 * auth path resolves the same address repeatedly within one request.
 */
class UserIdentityService {
  private readonly byEmail = new Map<string, AccountIdentity | null>();

  constructor(private readonly deps: UserIdentityDeps) {}

  /**
   * Resolve a sign-in address to its account, or null when unknown.
   *
   * Only a verified address resolves. A revoked address (changed away from) is
   * retained for attribution but must never authenticate, otherwise a reassigned
   * company address would inherit the previous holder's account.
   */
  public async resolveAccount(email: string): Promise<AccountIdentity | null> {
    const key: string = normalizeEmail(email);
    if (!key) return null;
    const cached: AccountIdentity | null | undefined = this.byEmail.get(key);
    if (cached !== undefined) return cached;
    const resolved: AccountIdentity | null = await resolveAccount(this.deps, key);
    this.byEmail.set(key, resolved);
    return resolved;
  }

  /**
   * Account id for a sign-in address, or null when unknown.
   */
  public async resolveUserId(email: string): Promise<string | null> {
    const account: AccountIdentity | null = await this.resolveAccount(email);
    return account?.id || null;
  }

  /**
   * Every address known for an account, verified ones first.
   */
  public async listAddresses(userId: string): Promise<Array<{ email: string; isVerified: boolean }>> {
    const dao: UserEmailDAO = await this.deps.userEmailDAO();
    const rows = await dao.listByUserId(userId);
    return rows.map((row) => ({ email: row.email, isVerified: row.is_verified === 1 }));
  }

  /**
   * Point an account at a new sign-in address.
   *
   * The account id, the frozen anchor, and every id-keyed grant are untouched:
   * only which address authenticates the account moves. The previous address is
   * revoked rather than deleted, so rows written before the change still resolve
   * to this account, and it is released for a later legitimate holder.
   *
   * The order is deliberate. Claiming first means the user is never locked out
   * — there is only a brief window where both addresses authenticate. Revoking
   * first opens a window where neither does. And `users.email` is never touched:
   * it is the frozen anchor that `connected_applications.user_email` cascades
   * from, so updating it would delete the user's applications, their API keys,
   * and their OAuth2 sessions.
   *
   * Rejects an address that is already verified for another account. Cloudflare
   * Access is the only authenticator, so an unverified self-service change would
   * let anyone claim an address and inherit its account.
   *
   * Not routed: proof of control for the new address (a confirm step performed
   * while authenticated as that address) has to land first. The ops path is
   * `scripts/change-email.ts`.
   */
  public async setPrimaryEmail(
    userId: string,
    newEmail: string,
    now: number = TimestampUtil.getCurrentUnixTimestampInSeconds(),
  ): Promise<AccountIdentity> {
    const email: string = normalizeEmail(newEmail);
    if (!email) throw new BadRequestError('Invalid email address');
    const userDAO: UserDAO = await this.deps.userDAO();
    const emailDAO: UserEmailDAO = await this.deps.userEmailDAO();
    const row = await userDAO.getById(userId);
    if (!row?.id) throw new BadRequestError('User not found');
    const current: string = normalizeEmail(row.current_email ?? row.email);
    if (current === email) {
      return { id: row.id, email, anchorEmail: row.email };
    }
    const holder = await emailDAO.resolveVerified(email);
    if (holder && holder.user_id !== row.id) throw new ConflictError('Email is already in use');
    await emailDAO.register({ email, userId: row.id, isVerified: true, now });
    // Move the sign-in address *before* revoking. Revoking first would leave a
    // window where neither the old nor the new address authenticates, locking
    // the user out of their own account.
    await userDAO.setCurrentEmail(row.id, email, now);
    // Revoke every other verified address, so only the new one authenticates.
    await emailDAO.revokeAllVerified(row.id, email);
    // Re-seed the memo: the old address now resolves to null, the new one to
    // this account. Leaving the stale entry would let the change take effect on
    // the next request instead of this one.
    this.byEmail.delete(current);
    this.byEmail.set(email, { id: row.id, email, anchorEmail: row.email });
    return { id: row.id, email, anchorEmail: row.email };
  }

  /**
   * Ops/migration path: attach an address that has already been proven, without
   * making it the sign-in address.
   */
  public async linkVerifiedEmail(
    userId: string,
    email: string,
    now: number = TimestampUtil.getCurrentUnixTimestampInSeconds(),
  ): Promise<void> {
    const address: string = normalizeEmail(email);
    if (!address) throw new BadRequestError('Invalid email address');
    const dao: UserEmailDAO = await this.deps.userEmailDAO();
    const outcome: 'claimed' | 'already-claimed' = await dao.register({ email: address, userId, isVerified: true, now });
    if (outcome === 'already-claimed') throw new ConflictError('Email is already in use');
  }
}

export { UserIdentityService };
export type { UserIdentityDeps };
