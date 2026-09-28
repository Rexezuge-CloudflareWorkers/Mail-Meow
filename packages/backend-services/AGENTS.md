# Mail-Meow — Backend Services (Business Logic)

Scope: `packages/backend-services/**`. Parent index: `../../AGENTS.md`.
Feature details: `../../docs/agents/features/*/AGENTS.md`.

Layer 3. May import layers 0–2 (`shared`, `backend-errors`, `backend-runtime`, `backend-data`,
`provider-clients`). Must not import `apps/*` (enforced by `no-restricted-imports`).

## Domains

- `apikey/ApiKeyService.ts` — issue/list/revoke API keys; hash before storage
  (`ApiKeyUtil.hashApiKey`, only `keyPrefix`/`keyLastFour` stored in plaintext);
  `resolveApplication` backs the `/api/:api_key/*` routes.
- `application/ApplicationService.ts` — connected-application CRUD + quota enforcement. Takes an
  `AccountIdentity`, not an email string: the id is the identity, the anchor is the pre-0011
  fallback. `ApplicationResponseUtil.withRedirectUri` adds `oauth2RedirectUri` to list responses.
- `auth/EmailValidationUtil.ts` — Cloudflare Access JWT verification via `jose`
  (`cf-access-jwt-assertion` header, `{TEAM_DOMAIN}/cdn-cgi/access/certs`, audience
  `POLICY_AUD`). `DEV_AUTH_EMAIL` is local-only and has no default.
- `email/MailDeliveryService.ts` — resolve application + access token, then `MailDeliveryUtil`.
- `sns/SnsDeliveryService.ts` — resolve application + credentials, then `SnsDeliveryUtil`.
- `oauth2/OAuth2AuthorizationService.ts` — PKCE + one-time `state` sessions.
  `OAuth2AccessTokenService.ts` — token acquisition with KV cache and per-application DO
  fan-out. `OAuth2StateUtil.ts` — state/verifier generation and hashing.
- `processing/ProcessingService.ts` — task-run queries and manual `oauth2_refresh` trigger.
- `user/UserService.ts` — `upsertUser` (**resolve-then-create** via `user/accountLookup.ts`, so an address that already identifies an account can never fork a second one; returns an `AccountIdentity` rather than `void`), plus `preferred_language` read/update keyed on the account id so a choice survives an address change.
- `user/accountLookup.ts` — shared `resolveAccount`/`registerAccount`. A **revoked** registry row is authoritative and never resolves; a row-less address falls through to the `users` lookups (the pre-0011 floor, where the address is the anchor). `registerAccount` uses the address as the anchor when free and an opaque one only when the address is already another account's anchor, so a released address is never permanently unusable.
  - **Fails closed.** The only tolerated registry failure is a genuinely absent `user_emails` table, detected by `isMissingTableError` (`D1ErrorClassifier`) on the _statement_, not just DAO construction. Every other error propagates as a `DatabaseError` so the request 5xxs. These lookups previously carried a blanket `.catch(() => null)`, which made a transient D1 error indistinguishable from an absent table — so a revoked address fell through to the anchor lookup and authenticated again. Never reintroduce a blanket `.catch` here.
  - The write path is guarded the same way: a failed `createUser` or a failed address claim propagates instead of being treated as a lost race. The opaque-anchor retry exists for a lost race, not for error recovery.
  - `test/data/accountLookup.test.ts` is the regression suite for this. Its "does not re-resolve a revoked address when the registry read fails" case is the one that must never be deleted.
- `identity/UserIdentityService.ts` — `resolveAccount`/`resolveUserId` (memoized per request scope) and the address-change path: `setPrimaryEmail` claims → moves → revokes, in that order, and never touches the frozen anchor; `linkVerifiedEmail` is the ops path. **Not routed**: Access is the sole authenticator, so a self-service address change needs a proof-of-control confirm step first (`scripts/change-email.ts` is the ops route).
- Address normalization is `normalizeEmail` in `@mail-meow/shared/utils` and nothing else. It used to be re-implemented in four places and the copies disagreed — the service layer trimmed, the DAOs lowercased only — so a padded address was the same account to `resolveAccount` and a different one to the DAO, and a registry row written with padding could never resolve its own account. Never inline `trim().toLowerCase()` for an address.
- `composition/` — `createRequestScope(env)`, the per-request composition root. See below.

## Composition Root

`createRequestScope(env)` builds every service for one request. Routes and background tasks
resolve services from it. Never `new XService(env)` in new code.

Each service exposes a `*Deps` constructor-injection seam (async factory functions for its
DAOs) so unit tests can pass fakes. The composition root constructs each DAO **once** and
wires it in; a service must never construct a DAO from `env` itself.

Adding a service to the composition root means: create the service, add a `*Deps` interface,
add it to the returned services object, and register it in `composition/index.ts`.

## Error Handling

- Throw `ServiceError` subclasses from `@mail-meow/backend-errors`; the route layer maps them
  to status codes. Never throw a bare `Error` for an expected failure — it bypasses the mapper
  and is masked as a generic 500.
- `NotFoundError` for a missing resource, `BadRequestError` for bad input,
  `ProviderApi*Error` for provider-side failures, `DatabaseError` for D1.
- Do not swallow exceptions. If a failure is genuinely tolerable, catch it **and** log it with
  enough detail to act on. `UserService.getPreferredLanguage` swallowing every D1 error (so a
  D1 outage looked like "no language set") is the pattern to avoid.
