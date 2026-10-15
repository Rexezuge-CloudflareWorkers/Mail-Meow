# Mail-Meow — Backend Services (Business Logic)

Scope: `packages/backend-services/**`. Parent index: `../../AGENTS.md`.
Feature details: `../../docs/agents/features/*/AGENTS.md`.

Layer 3. May import layers 0–2 (`shared`, `backend-runtime`, `backend-data`,
`provider-clients`) and `@rexezuge/*`. Must not import `apps/*` (enforced by
`no-restricted-imports`).

## Domains

- `apikey/ApiKeyService.ts` — issue/list/revoke API keys; hash before storage
  (`ApiKeyUtil.hashApiKey`, only `keyPrefix`/`keyLastFour` stored in plaintext);
  `resolveApplication` backs the `/api/:api_key/*` routes.
- `application/ApplicationService.ts` — connected-application CRUD + quota enforcement. Takes an
  `AccountIdentity`, not an email string: the id is the identity, the anchor is the pre-0011
  fallback. `ApplicationResponseUtil.withRedirectUri` adds `oauth2RedirectUri` to list responses.
- `identity/` — a re-export of `@rexezuge/identity`'s `UserIdentityService`. This repo's copy was the kit's provenance: the kit says it converged `identity/UserIdentityService.ts` and `user/accountLookup.ts` _from_ Mail-Meow and four siblings. Re-exported rather than reimplemented so there is one fail-closed resolution order.
- `email/MailDeliveryService.ts` — resolve application + access token, then
  `resolveStrategy(providerId).sendEmail(...)` from `@mail-meow/provider-clients`.
- `sns/SnsDeliveryService.ts` — resolve application + credentials, then `SnsDeliveryUtil`.
- `oauth2/OAuth2AuthorizationService.ts` — PKCE + one-time `state` sessions.
  `OAuth2AccessTokenService.ts` — token acquisition with KV cache and per-application DO
  fan-out. `OAuth2StateUtil.ts` — state/verifier generation and hashing.
- `processing/ProcessingService.ts` — task-run queries and manual `oauth2_refresh` trigger.
- `user/UserService.ts` — `upsertUser` (**resolve-then-create** via `@rexezuge/identity`'s `resolveAccount`/`registerAccount`, so an address that already identifies an account can never fork a second one; returns an `AccountIdentity` rather than `void`), plus `preferred_language` read/update keyed on the account id so a choice survives an address change. Registration tries the address as its own anchor first and an opaque one second; `UserDAO.createUser` detects the conflict, so the retry cannot mint a second account.
- `user/accountLookup.ts` is **deleted** — `@rexezuge/identity` owns it. The regression suite moved with it to `test/data/accountLookup.test.ts`, because the _rule_ is this repo's even where the code is now shared.
  - **Fails closed.** The only tolerated registry failure is a genuinely absent `user_emails` table, detected by `isMissingTableError` (`D1ErrorClassifier`) on the _statement_, not just DAO construction. Every other error propagates as a `DatabaseError` so the request 5xxs. These lookups previously carried a blanket `.catch(() => null)`, which made a transient D1 error indistinguishable from an absent table — so a revoked address fell through to the anchor lookup and authenticated again. Never reintroduce a blanket `.catch` here.
  - The write path is guarded the same way: a failed `createUser` or a failed address claim propagates instead of being treated as a lost race. The opaque-anchor retry exists for a lost race, not for error recovery.
  - `test/data/accountLookup.test.ts` is the regression suite for this. Its "does not re-resolve a revoked address when the registry read fails" case is the one that must never be deleted.
- `identity/UserIdentityService.ts` — re-exported from `@rexezuge/identity`; the file is gone.
  `resolveAccount`/`resolveUserId` (memoized per request scope) and the address-change path:
  `setPrimaryEmail` claims → moves → revokes, in that order, and never touches the frozen anchor;
  `linkVerifiedEmail` is the ops path. **Not routed**: Access is the sole authenticator, so a
  self-service address change needs a proof-of-control confirm step first
  (`scripts/change-email.ts` is the ops route).
- Address normalization is `normalizeEmail` from `@rexezuge/shared` and nothing else. It used to be re-implemented in four places and the copies disagreed — the service layer trimmed, the DAOs lowercased only — so a padded address was the same account to `resolveAccount` and a different one to the DAO, and a registry row written with padding could never resolve its own account. Never inline `trim().toLowerCase()` for an address.
- `composition/` — `createRequestScope(env)`, the per-request composition root. See below.

## Composition Root

`createRequestScope(env)` builds every service for one request and returns a
`@rexezuge/runtime` `Container`. Routes and background tasks resolve from it with
`scope.get(Tokens.X)`; the token registry is `composition/tokens.ts`. Never `new XService(env)`
in new code.

A container per request, never a module singleton: it closes over `env`, and one Worker
isolate serves requests with different `env` values between deployments. DAOs are registered
as memoized factories, which is what lets `ConnectedApplicationDAO` read the Secrets Store on
first use instead of on every request.

Each service exposes a `*Deps` constructor-injection seam (async factory functions for its
DAOs) so unit tests can pass fakes. The composition root constructs each DAO **once** and
wires it in; a service must never construct a DAO from `env` itself.

Adding a service to the composition root means: create the service, add a `*Deps` interface,
declare a `Token<T>` in `composition/tokens.ts`, register the factory in `requestScope.ts`, and
list the shape in `RequestScopeEnv`. All four, or the container will hand out a type that
cannot resolve.

## Error Handling

- Throw `ServiceError` subclasses from `@rexezuge/errors`; the route layer maps them
  to status codes. Never throw a bare `Error` for an expected failure — it bypasses the mapper
  and is masked as a generic 500. Note the kit's status assignments differ from the deleted local catalog: `DatabaseError` is **500** (it used to inherit a 502 through the outcome table), `RetryableError` 502, `NonRetryableError` 400, and an untyped throw becomes `InternalError` rather than `InternalServerError` — a distinction worth keeping, since the first means "an untyped value escaped a path that should have thrown from the taxonomy".
- `NotFoundError` for a missing resource, `BadRequestError` for bad input,
  `ProviderApi*Error` for provider-side failures, `DatabaseError` for D1.
- Do not swallow exceptions. If a failure is genuinely tolerable, catch it **and** log it with
  enough detail to act on. `UserService.getPreferredLanguage` swallowing every D1 error (so a
  D1 outage looked like "no language set") is the pattern to avoid.
