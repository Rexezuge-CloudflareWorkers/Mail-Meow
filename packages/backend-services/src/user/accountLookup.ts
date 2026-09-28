import { UserDAO } from '@mail-meow/backend-data/dao';
import type { UserEmailDAO } from '@mail-meow/backend-data/dao';
import type { AccountIdentity, UserInternal } from '@mail-meow/shared/model';
import { TimestampUtil } from '@mail-meow/shared/utils';

interface AccountLookupDeps {
  userDAO: () => Promise<UserDAO>;
  userEmailDAO: () => Promise<UserEmailDAO>;
}

/**
 * Normalize an address for registry lookups.
 *
 * The registry and `current_email` are both stored lowercased while Cloudflare
 * Access may deliver a mixed-case address, so every lookup is folded.
 */
function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Address → account resolution.
 *
 * The registry (`user_emails`) is the only mapping that survives an address
 * change, so it is consulted first; the `users` lookups are the floor for
 * databases that have not run migration 0011, where the address *is* the anchor.
 *
 * Kept as free functions rather than `UserService` methods so any service that
 * needs an account can share one implementation instead of re-deriving the
 * query, and so the god-file guard has room.
 */
async function resolveAccount(deps: AccountLookupDeps, email: string): Promise<AccountIdentity | null> {
  const normalized: string = normalize(email);
  if (!normalized) return null;
  const userDAO: UserDAO = await deps.userDAO();

  // A known address is authoritative: the registry says which account it
  // belongs to, and a *revoked* row (the account moved off this address) must
  // not resolve at all. Falling through to the anchor lookup in that case would
  // let a reassigned address keep authenticating the previous holder's
  // account, which is exactly what the revoke exists to prevent.
  const emailDAO: UserEmailDAO | null = await deps.userEmailDAO().catch(() => null);
  if (emailDAO) {
    const registered = await emailDAO.get(normalized).catch(() => null);
    if (registered) {
      if (registered.is_verified !== 1) return null;
      const byId: UserInternal | null = await userDAO.getById(registered.user_id).catch(() => null);
      return byId ? toIdentity(byId) : null;
    }
  }

  // No registry row. Migration 0011 backfilled a verified row for every anchor,
  // so a row-less address is either brand new or on a pre-0011 database where
  // the address is the anchor; both are covered by the `users` lookups. A
  // *revoked* address always has a row and returned above.
  // `getByCurrentEmail` is 0011-only, so a legacy database and an injected
  // fake may not have it.
  const byCurrent: UserInternal | null =
    typeof userDAO.getByCurrentEmail === 'function' ? await userDAO.getByCurrentEmail(normalized).catch(() => null) : null;
  const legacy: UserInternal | null = byCurrent ?? (await userDAO.getByEmail(normalized).catch(() => null));
  return legacy ? toIdentity(legacy) : null;
}

function toIdentity(row: UserInternal): AccountIdentity {
  return {
    id: row.id ?? '',
    email: normalize(row.current_email ?? row.email),
    anchorEmail: row.email,
  };
}

/**
 * Account id for an address, or null when unknown.
 */
async function resolveUserId(deps: AccountLookupDeps, email: string): Promise<string | null> {
  const account: AccountIdentity | null = await resolveAccount(deps, email);
  return account?.id || null;
}

/**
 * Insert an account and claim its sign-in address.
 *
 * The anchor is the address itself whenever it is free, which keeps every new
 * row shaped like the pre-0011 ones and leaves `connected_applications.user_email`
 * a real address. It falls back to an opaque anchor only when the address is
 * already held as another account's anchor — i.e. its previous holder moved off
 * it — so a released address is never permanently unusable.
 *
 * Returns null when neither anchor produced a resolvable account, which lets the
 * caller surface a failure rather than proceed without an id.
 */
async function registerAccount(
  deps: AccountLookupDeps,
  loginEmail: string,
  now: number = TimestampUtil.getCurrentUnixTimestampInSeconds(),
): Promise<AccountIdentity | null> {
  const normalized: string = normalize(loginEmail);
  if (!normalized) return null;
  const userDAO: UserDAO = await deps.userDAO();
  const emailDAO: UserEmailDAO | null = await deps.userEmailDAO().catch(() => null);

  // Resolve before creating. This ordering is the whole point: an address that
  // already identifies an account must return *that* account, never a second
  // one. Creating first and resolving afterwards would fork a duplicate the
  // moment anyone signed in with an address that had been reassigned.
  const existing: AccountIdentity | null = await resolveAccount(deps, normalized);
  if (existing) return existing;

  // The address as anchor first, opaque on the retry. `createUser` is a no-op
  // when the anchor is already taken, which is what makes the retry safe: it
  // cannot produce a second account for the same address.
  const id: string = UserDAO.newId();
  await userDAO.createUser({ id, anchor: normalized, loginEmail: normalized, now }).catch(() => null);
  // Claim the sign-in address *before* resolving, otherwise the fresh account is
  // invisible to the registry and registration looks like a failure.
  if (emailDAO) {
    await emailDAO.register({ email: normalized, userId: id, isVerified: true, now }).catch(() => null);
  }
  const viaAddress: AccountIdentity | null = await resolveAccount(deps, normalized);
  if (viaAddress) return viaAddress;

  // The address was someone's anchor. Take an opaque one so the address itself
  // stays free for whoever legitimately holds it now.
  const opaqueId: string = UserDAO.newId();
  const anchor: string = UserDAO.newAnchor();
  await userDAO.createUser({ id: opaqueId, anchor, loginEmail: normalized, now }).catch(() => null);
  if (emailDAO) {
    await emailDAO.register({ email: normalized, userId: opaqueId, isVerified: true, now }).catch(() => null);
  }
  return resolveAccount(deps, normalized);
}

export { registerAccount, resolveAccount, resolveUserId };
export type { AccountLookupDeps };
