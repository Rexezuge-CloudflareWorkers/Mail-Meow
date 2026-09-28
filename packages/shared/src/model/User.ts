/**
 * A `users` row.
 *
 * `id` is the stable account key and the only value that should be used as an
 * identity. `email` is the mutable sign-in address — the one the account
 * authenticates with and the one the API reports. `anchorEmail` is the frozen,
 * internally unique value that legacy `*_email` columns and their foreign keys
 * point at, so history stays resolvable across an address change.
 *
 * Accounts created before migration 0011 have their real address in both
 * `email` and `anchorEmail`. Accounts created after it get an opaque anchor
 * (`anchor-<hex>@users.invalid`) when the address is already held as another
 * account's anchor, because the address column is the primary key every legacy
 * foreign key resolves against and a real address used there could never be
 * re-registered by a different person.
 */
interface User {
  id: string;
  email: string;
  anchorEmail: string;
  preferredLanguage?: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * The account behind an address, as carried through the service and DAO layers.
 *
 * `id` is empty on a database that has not run migration 0011, where the
 * address is still the primary key. Callers pass this whole object as the
 * owner of a user-keyed row so the DAOs can match on the id and fall back to
 * the anchor without needing to know which shape the row has.
 */
interface AccountIdentity {
  id: string;
  /**
  The address the account currently signs in with.
  */
  email: string;
  /**
  The immutable anchor stored in legacy `*_email` columns.
  */
  anchorEmail: string;
}

interface UserInternal {
  id?: string | null;
  /**
  The frozen anchor.
  */
  email: string;
  current_email?: string | null;
  preferred_language?: string | null;
  created_at: number;
  updated_at: number;
}

export type { AccountIdentity, User, UserInternal };
