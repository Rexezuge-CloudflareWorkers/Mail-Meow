# Mail-Meow — Backend Data (D1/DAO Layer)

Scope: `packages/backend-data/**`. Parent index: `../../AGENTS.md`.

Layer 2. May import `@mail-meow/shared` and `@mail-meow/backend-errors`. Must not import
`backend-runtime`, `provider-clients`, `backend-services`, or `apps/*`.

## DAOs

- `BaseDAO` — holds the `D1Queryable`; provides the static `findById` generic lookup with
  SQL-identifier allow-listing. `EncryptedDAO` adds the `masterKey` used by
  `ConnectedApplicationDAO`.
- `ApplicationApiKeyDAO` — API key records (hash + prefix + last four, expiry, last-used).
- `OAuth2AuthorizationSessionDAO` — PKCE `code_verifier`, hashed `state_hash`, `consumed_at`
  for one-time use.
- `OAuth2AccessTokenRefreshStatusDAO` — per-application token expiry/refresh bookkeeping.
- `OAuth2AccessTokenCacheDAO` — KV-backed encrypted access-token cache.
- `UserDAO` — `users` by id or address (`createUser` stamping the 0011 `id`/`current_email` columns, `newId()`/`newAnchor()`, `getById`/`getByEmail` (frozen anchor, exact match)/`getByCurrentEmail` (case-insensitive), `setCurrentEmail`, `updatePreferredLanguage` keyed on id with the anchor as the pre-0011 fallback).
- `UserEmailDAO` — the `user_emails` address registry: `register` re-points a revoked row but refuses a verified one, `get`/`resolveVerified`, `revokeAllVerified`, `listByUserId`.
- `ConnectedApplicationDAO` — connected applications (encrypted credential blobs, `status` CHECK-constrained, paginated listing with an opaque cursor). Ownership matches `(user_id = ? OR (user_id IS NULL AND user_email = ?))`; the reported `userEmail` is `COALESCE(users.current_email, user_email)` via a LEFT JOIN, so an opaque anchor never reaches an API response.
- `BackgroundTaskRunDAO` — cron task-run history: start/succeed/fail/skip plus batched pruning. `listForUser` scopes by the owning application's `user_id`, with the `*_email` fallback.

## Migrations

- `0011_user_identity.sql` is the user-identity migration and is deliberately **not** a table rebuild — see `docs/agents/runtime/AGENTS.md` for why the `REFERENCES users(email)` clause cannot be repointed on D1. `UserIdentityUpgrade.int.test.ts` seeds every cascade edge, applies it, and asserts zero row loss + a clean `foreign_key_check`.
- `0007_v3_reset_schema.sql` recreates `users` from scratch. Any table with a foreign key to `users` must appear in its drop list (`user_emails` does), or the reset leaves the child pointing at a `users` without the newer columns.
- `IKeyValueDAO` — thin typed wrapper over a KV namespace binding.

## utils

- `D1Utils.ts` — `executeD1WithRetry`, the single retrying D1 entry point. Classifies errors via
  `D1ErrorClassifier` and backs off exponentially **with jitter**.
- `D1SessionUtil.ts` — `createD1SessionEnv(env, bookmark)` for the `x-d1-bookmark` round trip.
- `CursorUtil.ts` — opaque base64url cursor codec used by every paginated DAO.
- `RepositoryHelper.ts` — `pruneInBatches` (bounded), `computeUnixCutoffSeconds`,
  `computeDateCutoffIso`, `DEFAULT_PRUNE_BATCH_SIZE`.
- `D1ErrorClassifier.ts` — decides whether a D1 failure is retryable.

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
