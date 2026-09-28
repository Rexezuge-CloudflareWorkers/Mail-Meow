# Mail-Meow — Backend Services (Business Logic)

Scope: `packages/backend-services/**`. Parent index: `../../AGENTS.md`.
Feature details: `../../docs/agents/features/*/AGENTS.md`.

Layer 3. May import layers 0–2 (`shared`, `backend-errors`, `backend-runtime`, `backend-data`,
`provider-clients`). Must not import `apps/*` (enforced by `no-restricted-imports`).

## Domains

- `apikey/ApiKeyService.ts` — issue/list/revoke API keys; hash before storage
  (`ApiKeyUtil.hashApiKey`, only `keyPrefix`/`keyLastFour` stored in plaintext);
  `resolveApplication` backs the `/api/:api_key/*` routes.
- `application/ApplicationService.ts` — connected-application CRUD + quota enforcement.
  `ApplicationResponseUtil.withRedirectUri` adds `oauth2RedirectUri` to list responses.
- `auth/EmailValidationUtil.ts` — Cloudflare Access JWT verification via `jose`
  (`cf-access-jwt-assertion` header, `{TEAM_DOMAIN}/cdn-cgi/access/certs`, audience
  `POLICY_AUD`). `DEV_AUTH_EMAIL` is local-only and has no default.
- `email/MailDeliveryService.ts` — resolve application + access token, then `MailDeliveryUtil`.
- `sns/SnsDeliveryService.ts` — resolve application + credentials, then `SnsDeliveryUtil`.
- `oauth2/OAuth2AuthorizationService.ts` — PKCE + one-time `state` sessions.
  `OAuth2AccessTokenService.ts` — token acquisition with KV cache and per-application DO
  fan-out. `OAuth2StateUtil.ts` — state/verifier generation and hashing.
- `processing/ProcessingService.ts` — task-run queries and manual `oauth2_refresh` trigger.
- `user/UserService.ts` — user upsert and `preferred_language` read/update.
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
