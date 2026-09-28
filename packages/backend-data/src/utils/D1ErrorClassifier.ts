const RETRYABLE_PATTERNS: RegExp[] = [
  /busy/i,
  /locked/i,
  /timeout/i,
  /timed?\s*out/i,
  /internal\s+(server\s+)?error/i,
  /connection/i,
  /network/i,
  /unavailable/i,
  /throttl/i,
  /too\s+many/i,
  /retry/i,
  /deadlock/i,
  /serialization/i,
];

const NON_RETRYABLE_PATTERNS: RegExp[] = [
  /constraint/i,
  /unique/i,
  /primary\s+key/i,
  /foreign\s+key/i,
  /not\s+found/i,
  /syntax/i,
  /parse\s+error/i,
  /no\s+such\s+(table|column|index)/i,
  /type\s+mismatch/i,
  /range/i,
  /permission/i,
  /authorization/i,
  /authentication/i,
  /invalid\s+argument/i,
];

function isD1ErrorRetryable(errorMessage: string): boolean {
  if (!errorMessage) return false;

  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (pattern.test(errorMessage)) return false;
  }

  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(errorMessage)) return true;
  }

  return false;
}

/**
 * The message D1 reports when a migration has not created a table yet.
 *
 * Deliberately narrower than the `no such (table|column|index)` entry in
 * `NON_RETRYABLE_PATTERNS`: this is the single signal that separates "this
 * database predates a feature" from "this query failed", and conflating the two
 * is what let a transient D1 error be treated as an absent table.
 */
const MISSING_TABLE_PATTERN = /no\s+such\s+table/i;

/**
 * Whether a failure means the schema is not there, rather than the query failing.
 *
 * A pre-0011 database has no `user_emails` table, and the pre-0011 `users`
 * lookups are the correct floor for it. Every other failure — a timeout, a lock,
 * a permissions problem — must propagate instead: swallowing it makes a
 * transient outage indistinguishable from an absent table, and the caller then
 * takes a fallback path that was only ever safe for an old schema.
 */
function isMissingTableError(error: unknown): boolean {
  const message: string = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return MISSING_TABLE_PATTERN.test(message);
}

export { isD1ErrorRetryable, isMissingTableError };
