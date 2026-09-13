# Mail-Meow — Runtime And Configuration

Scope: Wrangler bindings, build output, env vars. Parent index: `../../../AGENTS.md`.

- Root package `@mail-meow/monorepo`, pnpm workspaces (`apps/*`, `packages/*`).
- `apps/web/vite.config.ts` proxies `/api` → `http://localhost:8787` in dev; `closeBundle` embeds `dist/index.html` into `apps/api/src/generated/spa-shell.ts` (`SPA_HTML`) on build.
- `apps/api/wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer; no committed `wrangler.jsonc`.
- The Worker serves the SPA only from its `/user/*` catch-all (`MailMeowWorker`: non-`/user/` paths return 404) so API routes aren't intercepted by the assets handler.
- Worker bindings: D1 `DB`, KV `OAUTH2_TOKEN_CACHE`, Secrets Store `AES_ENCRYPTION_KEY_SECRET`, DOs `CRON_TASKS` / `OAUTH2_TOKEN_REFRESHERS`, cron `*/10 * * * *`.

## Required vars (no defaults)

`POLICY_AUD`, `TEAM_DOMAIN` — Cloudflare Access JWT verification (`EmailValidationUtil`). No default; requests fail without them.

## Local-only (no default, not in `ConfigurationDefaults.ts`)

`DEV_AUTH_EMAIL` — bypasses Cloudflare Access locally.

## Optional vars (defaults in `ConfigurationDefaults.ts`)

| Group | Vars (default) |
|---|---|
| Limits | `MAX_APPLICATIONS_PER_USER` (`99`), `MAX_API_KEYS_PER_APPLICATION` (`5`) |
| API keys | `DEFAULT_API_KEY_EXPIRY_DAYS` (`365`), `MAX_API_KEY_EXPIRY_DAYS` (`365`) |
| OAuth2 | `OAUTH2_STATE_EXPIRY_MINUTES` (`15`), `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS` (`900`), `OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS` (`60`), `OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS` (`3600`), `OAUTH2_TOKEN_REFRESH_BATCH_SIZE` (`25`) |
| Retention | `BACKGROUND_TASK_RUN_RETENTION_DAYS` (`30`) |
| Misc | `DEBUG_MODE` (`false`) |

Add new env vars in `ConfigurationDefaults.ts` (+ `ConfigurationManager` getter + `AppConfiguration` method), not inline.

## Dependency injection (`packages/backend-runtime/src/di/`)

- `AppConfiguration` (`backend-runtime/src/config/AppConfiguration.ts`) — injectable instance view over env parsing (captured env, one method per setting); `ConfigurationManager` statics remain as a thin backward-compatible facade. Prefer injecting `AppConfiguration` (or structural subsets) in new services; mock via constructor deps, not module mocks.

- `Container` — minimal Factory + Singleton DI container (`bind`/`bindValue`/`get`/`resolve`/`createChild`). Composition roots (API/background workers, tests) wire dependencies once; services declare constructor deps on interfaces.
- `createServiceContext(env, overrides?)` — single request-scoped `{ env, logger, clock }` replacing bespoke `*Env` subsets. Prefer extending/deriving from `ServiceContext` over new `*Env` interfaces; never reintroduce `as` env casts in new code.
