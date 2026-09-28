# Mail-Meow — Runtime And Configuration

Scope: Wrangler bindings, build output, env vars. Parent index: `../../../AGENTS.md`.

- Root package `@mail-meow/monorepo`, pnpm workspaces (`apps/*`, `packages/*`).
- `apps/web/vite.config.ts` proxies `/api` → `http://localhost:8787` in dev; `closeBundle` embeds `dist/index.html` into `apps/api/src/generated/spa-shell.ts` (`SPA_HTML`) on build.
- `apps/api/wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer; no committed `wrangler.jsonc`.
- The Worker serves the SPA only from its `/user/*` catch-all (`MailMeowWorker`: non-`/user/` paths return 404) so API routes aren't intercepted by the assets handler.
- Worker bindings: D1 `DB`, KV `OAUTH2_TOKEN_CACHE`, Secrets Store `AES_ENCRYPTION_KEY_SECRET`, DOs `CRON_TASKS` / `OAUTH2_TOKEN_REFRESHERS`, cron `*/10 * * * *`.

## Required vars (no defaults)

`POLICY_AUD`, `TEAM_DOMAIN` — Cloudflare Access JWT verification (`EmailValidationUtil`). No default; requests fail without them.

## Local-only (no default, not a tunable setting)

`DEV_AUTH_EMAIL` — bypasses Cloudflare Access locally.

## Optional vars (defaults declared alongside each descriptor in `AppConfig.ts`)

| Group     | Vars (default)                                                                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Limits    | `MAX_APPLICATIONS_PER_USER` (`99`), `MAX_API_KEYS_PER_APPLICATION` (`5`)                                                                                                                                                                  |
| API keys  | `DEFAULT_API_KEY_EXPIRY_DAYS` (`365`), `MAX_API_KEY_EXPIRY_DAYS` (`365`)                                                                                                                                                                  |
| OAuth2    | `OAUTH2_STATE_EXPIRY_MINUTES` (`15`), `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS` (`900`), `OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS` (`60`), `OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS` (`3600`), `OAUTH2_TOKEN_REFRESH_BATCH_SIZE` (`25`) |
| Retention | `BACKGROUND_TASK_RUN_RETENTION_DAYS` (`30`)                                                                                                                                                                                               |
| Misc      | `DEBUG_MODE` (`false`), `PROVIDER_REQUEST_TIMEOUT_MS` (`15000`)                                                                                                                                                                           |

Add new env vars as one entry in `SETTING_DESCRIPTORS` (`backend-runtime/src/config/AppConfig.ts`),
not inline. Each descriptor carries the key, a typed parser, and a numeric default, and
drives both parsing and the documented table above. Cross-setting invariants go in
`validateConfig`, which runs once at construction so a bad deployment fails at
configuration time rather than per request.

Values that are not safe integers, or that are not recognised booleans, fall back to the
default **and log a warning** — a typo'd variable name is otherwise indistinguishable from
an unset one. Unrecognised `UPPER_SNAKE` keys also warn. Read configuration through
`scope.config` (an `AppConfigReader`); do not read `env` directly for a tunable setting.

## Dependency injection

There is no container. `createRequestScope(env)`
(`packages/backend-services/src/composition/requestScope.ts`) is a plain composition root
that constructs each DAO **once**, memoizes the Secrets Store master key, and passes every
collaborator to each service's constructor as an explicit `*Deps` object.

- Services never construct a DAO from `env`. If a service needs a DAO, it declares a
  factory in its `*Deps` interface and the composition root supplies it.
- Unit tests pass fakes through the same `*Deps` seam. Module mocks are not needed.
- Because collaborators are constructor arguments, there is nothing to register, no token
  to look up, and no binding that can be forgotten at a call site.

The previous `Container` + `Tokens` pair was a service locator: seven of its bindings were
never resolved, the memoized DAOs it exposed were bypassed (each service built its own from
`env`), and hiding that required seven `as never` casts.

- `AppConfiguration` (`backend-runtime/src/config/AppConfiguration.ts`) — injectable instance view over env parsing (captured env, one method per setting); `ConfigurationManager` statics remain as a thin backward-compatible facade. Prefer injecting `AppConfiguration` (or structural subsets) in new services; mock via constructor deps, not module mocks.

- `Container` — minimal Factory + Singleton DI container (`bind`/`bindValue`/`get`/`resolve`/`createChild`). Composition roots (API/background workers, tests) wire dependencies once; services declare constructor deps on interfaces.
- `createServiceContext(env, overrides?)` — single request-scoped `{ env, logger, clock }` replacing bespoke `*Env` subsets. Prefer extending/deriving from `ServiceContext` over new `*Env` interfaces; never reintroduce `as` env casts in new code.
