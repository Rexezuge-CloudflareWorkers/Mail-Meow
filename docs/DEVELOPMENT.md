# Mail-Meow Development

## Commands

Plain `pnpm` — no `source ~/.customrc`, no `volta run` prefix. CI uses
`pnpm/action-setup@v4` and `setup-node node 24`, so anything that only works under a
shell wrapper is a command that does not work in CI.

```bash
pnpm install
pnpm -r typecheck && pnpm run lint && pnpm run test:coverage && pnpm run test:integration
pnpm run lint:check      # report-only, no --fix
pnpm run prettier        # format; prettier:check verifies
pnpm --filter @mail-meow/web build   # only web has a build script
pnpm --filter @mail-meow/web dev     # vite dev server
pnpm exec wrangler dev
pnpm exec wrangler deploy
pnpm run typegen         # after changing wrangler bindings
```

Two of those carry a trap worth knowing before you hit it:

- **`pnpm run typegen` is a prerequisite for `pnpm -r typecheck`.** `worker-configuration.d.ts`
  is generated and gitignored. Without it you get ~8 phantom errors that look like real
  breakage.
- **`pnpm run lint` sets `NODE_OPTIONS=--max-old-space-size=6144`** because type-aware ESLint
  over this tree exceeds the default V8 heap and aborts with `FATAL ERROR: … JavaScript heap
out of memory`, leaving `core.*` dumps behind.

`pnpm --filter @mail-meow/web build` is what regenerates `apps/api/src/generated/spa-shell.ts`.
The API worker serves that file, so a build is required before anything else works.

## Project Layout

A pnpm workspace: `apps/*`, `packages/*`.

| Directory                   | What it holds                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api`                  | The Hono + Chanfana Worker. `src/workers/` assembles the router, `src/endpoints/` holds the route classes, `src/middleware/` holds Access auth and HTTP hardening. |
| `apps/background`           | `CronTasksWorker` + `OAuth2TokenRefreshWorker` Durable Objects, and `scheduled/` (the cron table).                                                                 |
| `apps/web`                  | The Vite React SPA served at `/user`.                                                                                                                              |
| `packages/shared`           | Models, Zod schemas, constants, and the two utils that are this app's (`ApiKeyUtil`, `BaseUrlUtil`).                                                               |
| `packages/backend-runtime`  | Worker base classes, `AppConfigReader`, DO hostnames, and `createD1SessionEnv`.                                                                                    |
| `packages/backend-data`     | DAOs and the D1 helpers.                                                                                                                                           |
| `packages/provider-clients` | OAuth2, MIME, the per-provider send strategies, SNS, and the shared HTTP layer.                                                                                    |
| `packages/backend-services` | Business logic, plus `composition/` — the per-request DI container.                                                                                                |
| `migrations/`               | D1 migrations. `0007_v3_reset_schema.sql` intentionally resets old v1/v2 tables.                                                                                   |

### What came from `@rexezuge/sdk`

`@rexezuge/{errors,shared,d1,runtime,identity,http,web,tooling}` are the shared kernel the
whole `Rexezuge-CloudflareWorkers` family converged onto; this repo consumed them rather than
carrying its own copies. Concretely:

| Was                                                                              | Is now                                                                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/backend-errors/`                                                       | `@rexezuge/errors`                                                                      |
| `shared/utils/{Crypto,Timestamp,UUID,ErrorSanitization,Locale}Util`, `EmailUtil` | `@rexezuge/shared`                                                                      |
| `backend-data/crypto/aes-gcm.ts`                                                 | `@rexezuge/d1`'s `encryptSecret` / `decryptSecret`                                      |
| `backend-data/utils/{D1Utils,D1ErrorClassifier,CursorUtil}`                      | `@rexezuge/d1` / `@rexezuge/shared`                                                     |
| `backend-data/dao/UserDAO`, `UserEmailDAO`                                       | `@rexezuge/identity`, subclassed for `preferred_language` and the `NOT NULL updated_at` |
| `backend-services/{identity,user/accountLookup}`                                 | `@rexezuge/identity`                                                                    |
| `backend-services/auth/EmailValidationUtil`                                      | `@rexezuge/http`'s `authenticateAccess`                                                 |
| `apps/api/src/errors/errorResponse.ts`                                           | `@rexezuge/http`'s `ErrorMapper` + a local redaction backstop                           |
| `background/scheduled/IScheduledTask`                                            | `@rexezuge/runtime`'s `AbstractScheduledTask` + `describeFailure`                       |
| `backend-runtime/base/*Worker`                                                   | `@rexezuge/runtime`'s, with a redacting `reportUnhandled`                               |
| `eslint.config.mjs`, `vitest.config.mts`                                         | `@rexezuge/tooling`'s `defineRepoLintConfig` / `defineUnitVitestConfig`                 |

Two things did **not** converge and stay local, both deliberately: `ConnectedApplicationDAO`
(this schema's `preferred_language` column and a `NOT NULL updated_at` the kit does not model)
and the SPA's visual layer (literal `#hex` rather than the kit's CSS custom properties).

One version rule: the kit is pinned **exactly** and `pnpm-workspace.yaml` carries an
`overrides` block for it. Two copies of a package that identifies its types with `instanceof`
is a silent correctness bug — a `DatabaseError` thrown inside the kit stops being a
`ServiceError` at this repo's boundary, so every `catch` that narrows on the taxonomy falls
through to a masked 500, and the failure names no package.

## Route Model

Cloudflare Zero Trust protects `/user/*`. `@rexezuge/http`'s `authenticateAccess` verifies the
`cf-access-jwt-assertion` header against `{TEAM_DOMAIN}/cdn-cgi/access/certs` with audience
`POLICY_AUD`, then `UserService.upsertUser` resolves the address to an account and publishes
its id on the Hono context.

Protected user routes (`/user/*`):

- `GET /user/me`, `PUT /user/me`
- `GET /user/applications`
- `POST /user/application`, `PUT /user/application`, `DELETE /user/application`
- `POST /user/application/oauth2/authorize`
- `GET /user/application/api-keys`, `POST /user/application/api-key`,
  `DELETE /user/application/api-key`
- `GET /user/processing/task-runs`, `POST /user/processing/run-task`

Public API routes:

- `GET /api/oauth2/callback/:applicationId`
- `POST /api/:api_key/email`
- `POST /api/:api_key/sns`

The OAuth2 callback is public because providers do not send Cloudflare Access headers. It is
secured by short-lived one-time state plus PKCE.

`/user/*` carries a rate limit; `/api/*` deliberately does not. See
`apps/api/src/middleware/HttpHardening.ts` for why a 429 on a delivery endpoint is worse than
no limit.

## Provider Naming

- `google-gmail` / `oauth2`
- `microsoft-outlook` / `oauth2`
- `amazon-sns` / `access-keys`

## Configuration

`apps/api/wrangler.template.jsonc` holds the bindings; `apps/api/wrangler.jsonc` is gitignored
and per-deployer. Settings are read by `AppConfigReader` (`packages/backend-runtime`) from the
env, parsed lazily and **warned about** rather than thrown on — a misconfiguration is a log
line, not a 500 storm, because a Worker that throws during config read takes down every route
including `/`.

Defaults: `MAX_APPLICATIONS_PER_USER=99`, `MAX_API_KEYS_PER_APPLICATION=5`,
`DEFAULT_API_KEY_EXPIRY_DAYS=365`, `MAX_API_KEY_EXPIRY_DAYS=365`,
`OAUTH2_STATE_EXPIRY_MINUTES=15`, `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS=900`,
`OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS=60`, `OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS=3600`,
`OAUTH2_TOKEN_REFRESH_BATCH_SIZE=25`, `BACKGROUND_TASK_RUN_RETENTION_DAYS=30`,
`PROVIDER_REQUEST_TIMEOUT_MS=15000`, `DEBUG_MODE=false`.

The API worker calls `AppConfigReader.validate()` once per isolate, on its first request, and logs
every warning it returns: unrecognized vars, unparseable values, and the cross-setting invariants
(`DEFAULT_API_KEY_EXPIRY_DAYS` must not exceed `MAX_API_KEY_EXPIRY_DAYS`; the refresh window
must exceed the minimum valid window).

Set `DEV_AUTH_EMAIL` only for local development without Cloudflare Access.
