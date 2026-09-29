/**
 * Address normalization, in one place.
 *
 * Addresses arrive from Cloudflare Access with unknown casing and padding, are
 * stored lowercased, and are used as identity keys. That makes the exact
 * normalization rule a correctness concern rather than a cosmetic one: a
 * trailing space that one layer trims and another does not is a *different
 * account key* on each side of the boundary.
 *
 * This function used to exist four times, and the copies disagreed. The service
 * layer trimmed and lowercased; `UserEmailDAO` and `UserDAO` lowercased only. So
 * `"  Alice@Example.com "` and `"alice@example.com"` were the same account to
 * `resolveAccount` and different accounts to the DAO, and an address registered
 * with padding was stored untrimmed — making its own registry row unresolvable.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export { normalizeEmail };
