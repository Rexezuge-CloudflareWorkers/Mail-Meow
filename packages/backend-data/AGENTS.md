# Mail-Meow — Backend Data (D1/DAO Layer)

Scope: `packages/backend-data/**`. Parent index: `../../AGENTS.md`.

Layer 2. May import `@mail-meow/shared` and `@rexezuge/{d1,errors,shared}`. Must not import
`backend-runtime`, `provider-clients`, `backend-services`, or `apps/*`.

`packages/backend-data/crypto/` is gone: AES-GCM is `@rexezuge/d1`'s `encryptSecret` /
`decryptSecret`. The envelope is byte-compatible with what this repo wrote — same
cipher, same 96-bit random IV, same base64 — so stored credentials decrypt unchanged
and no migration ran. `test/integration/api/CredentialEnvelope.int.test.ts` is the
test that proves it, and it is the first thing to break if that ever stops being true.

## DAOs

- `BaseDAO` — `@rexezuge/d1`'s, sql-first: `run` / `first` / `all` / `count` / `batch` take
  SQL and bindings, and the retry plus the `success: false` normalization are invisible
  at the call site. Local additions: `EncryptedDAO` (the `masterKey`),
  `findRowById` / `deleteOlderThan` (the identifier-validated generic lookups) and
  `assertSqlIdentifier`.
- `ApplicationApiKeyDAO` — API key records (hash + prefix + last four, expiry, last-used).
- `OAuth2AuthorizationSessionDAO` — PKCE `code_verifier`, hashed `state_hash`, `consumed_at`
  for one-time use.
- `OAuth2AccessTokenRefreshStatusDAO` — per-application token expiry/refresh bookkeeping.
- `OAuth2AccessTokenCacheDAO` — KV-backed encrypted access-token cache.
- `UserDAO` — subclasses `@rexezuge/identity`'s. `users` by id or address (`createUser` stamping the 0011 `id`/`current_email` columns, `newId()`/`newAnchor()`, `getById`/`getByEmail` (frozen anchor, exact match)/`getByCurrentEmail` (case-insensitive), `setCurrentEmail`, `updatePreferredLanguage` keyed on id with the anchor as the pre-0011 fallback).
- `UserEmailDAO` — re-exported from `@rexezuge/identity`, not a local file: the `user_emails`
  address registry (`register` re-points a revoked row but refuses a verified one, `get`/
  `resolveVerified`, `revokeAllVerified`, `listByUserId`). The local copy was deleted rather than
  forked, so the "a verified row is never stolen" rule has exactly one implementation.
- `ConnectedApplicationDAO` — connected applications (encrypted credential blobs, `status` CHECK-constrained, paginated listing with an opaque cursor). Ownership matches `(user_id = ? OR (user_id IS NULL AND user_email = ?))`; the reported `userEmail` is `COALESCE(users.current_email, user_email)` via a LEFT JOIN, so an opaque anchor never reaches an API response.
- `BackgroundTaskRunDAO` — cron task-run history: start/succeed/fail/skip plus batched pruning. `listForUser` scopes by the owning application's `user_id`, with the `*_email` fallback.

## Migrations

- `0011_user_identity.sql` is the user-identity migration and is deliberately **not** a table rebuild — see `docs/agents/runtime/AGENTS.md` for why the `REFERENCES users(email)` clause cannot be repointed on D1. `UserIdentityUpgrade.int.test.ts` seeds every cascade edge, applies it, and asserts zero row loss + a clean `foreign_key_check`.
- `0007_v3_reset_schema.sql` recreates `users` from scratch. Any table with a foreign key to `users` must appear in its drop list (`user_emails` does), or the reset leaves the child pointing at a `users` without the newer columns.
- `IKeyValueDAO` — thin typed wrapper over a KV namespace binding.

## utils

- `RepositoryHelper.ts` — `pruneInBatches` (bounded), `computeUnixCutoffSeconds`,
  `computeDateCutoffIso`, `DEFAULT_PRUNE_BATCH_SIZE`. The only thing left in `utils/`.

Four files used to be here and are now `@rexezuge/d1`'s or `@rexezuge/shared`'s:
`D1Utils.ts` (`executeD1WithRetry` — retry with jittered backoff),
`D1ErrorClassifier.ts` (`isD1ErrorRetryable`, `isMissingTableError`), `CursorUtil.ts` (the
opaque base64url cursor codec), and `D1SessionUtil.ts`, which moved to
`packages/backend-runtime/src/base/D1SessionEnv.ts` because it wraps a binding rather than
doing data access and `apps/api` may not reach `backend-data` values.

`isMissingTableError` is the one worth remembering: it reports that the _schema_ is absent
(a migration has not run) rather than that the query failed, and that distinction is what lets
callers keep a documented pre-migration fallback without also swallowing real outages.

## Rules

- **All values are bound, never interpolated.** Dynamic SQL may only vary by identifier, and
  every identifier must pass the `SQL_IDENTIFIER_PATTERN` allow-list in `BaseDAO`.
- **Route every statement through `executeD1WithRetry`.** Hand-rolling `.run()` plus
  `if (!result.success) throw new DatabaseError(...)` silently defaults `retryable` to `false`
  and gives the failure-sensitive paths no retry at all.
- **Check `result.meta.changes` wherever a statement carries single-use or ownership
  semantics.** `OAuth2AuthorizationSessionDAO.consume` omitted this, so a losing racer was told
  it had consumed the session.
- **Bound batch loops.** A `while` that deletes batches needs an iteration cap or a deadline, or
  a large backlog will exhaust the CPU budget mid-delete.
- **Never delete rows that are still in use** — pruning predicates must exclude live states
  (e.g. `status != 'running'`).
- Row → domain mapping is a private mapper per DAO (`toMetadata`, `toUser`, `toRun`, …). Do not
  silently coerce an unexpected value to a valid-looking default; a corrupt row should surface.
