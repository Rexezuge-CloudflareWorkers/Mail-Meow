# Mail-Meow — Runtime And Configuration

Scope: Wrangler bindings, build output, env vars. Parent index: `../../../AGENTS.md`.

- Root package `@mail-meow/monorepo`, pnpm workspaces (`apps/*`, `packages/*`).
- `apps/web/vite.config.ts` proxies `/api` → `http://localhost:8787` in dev; `closeBundle` embeds `dist/index.html` into `apps/api/src/generated/spa-shell.ts` (`SPA_HTML`) on build.
- `apps/api/wrangler.template.jsonc` is the config template — copy to `wrangler.jsonc` per deployer; no committed `wrangler.jsonc`.
- The Worker serves the SPA only from its `/user/*` catch-all (`MailMeowWorker`: non-`/user/` paths return 404) so API routes aren't intercepted by the assets handler.
- Worker bindings: D1 `DB`, KV `OAUTH2_TOKEN_CACHE`, Secrets Store `AES_ENCRYPTION_KEY_SECRET`, DOs `CRON_TASKS` / `OAUTH2_TOKEN_REFRESHERS`, cron `*/10 * * * *`.

## D1 migrations

- `migrations/*.sql` applies in filename order via `wrangler d1 migrations apply`; the integration harness reads the same files (`test/integration/vitest.config.mts` → `__INTEGRATION_MIGRATION_FILES__`) and applies **one statement at a time**, supporting `applyMigrations(db, {from, to})` for a range.
- **D1 enforces foreign keys in queries and migrations, and honours neither `PRAGMA foreign_keys = off` nor `PRAGMA legacy_alter_table = on` through the Worker binding.** `PRAGMA defer_foreign_keys = on` _is_ honoured, but per D1's own documentation it does **not** suppress `ON DELETE CASCADE`. Consequences for schema changes:
  - Never plan a migration around `DROP TABLE` + `RENAME` of a table other tables reference — the implicit `DELETE FROM` cascades. Use additive `ALTER TABLE … ADD COLUMN` and backfill.
  - `connected_applications.user_email REFERENCES users(email) ON DELETE CASCADE` cannot be repointed, which is why `0011_user_identity.sql` freezes `users.email` as an anchor instead of rebuilding that table. Rebuilding it would cascade away every application, API key, and OAuth2 session the user owns.
- **Do not wrap a whole migration file in one `db.batch()` when it both adds a column and creates a table referencing it.** A batch is prepared in full before the first statement executes, so the new table's FK is validated against a schema the `ADD COLUMN` has not reached yet, and the file fails with `foreign key mismatch`.
- SQLite cannot `ADD COLUMN` a PRIMARY KEY. For a stable account key on an existing table, add a plain column and put a UNIQUE index on it — a unique index is a valid foreign-key parent, which is all a `REFERENCES` clause needs.
- `0007_v3_reset_schema.sql` is the v3 reset and drops every table before recreating `users`. **Any table with a foreign key to `users` must be added to that drop list**, or re-running the reset (which the integration harness does on every `applyMigrations` call) leaves the child pointing at a `users` recreated without the new columns.
- `UserIdentityUpgrade.int.test.ts` is the template for "do not break an existing database": seed every cascade edge, apply the migration, then assert zero row loss across all of them plus `PRAGMA foreign_key_check` empty.

## Ops

- `scripts/change-email.ts` — change a user's sign-in address. Wraps `UserIdentityService.setPrimaryEmail`'s three statements in the same order, takes a `wrangler d1 export` backup first (skippable with `--no-backup`), and refuses (rather than half-applying) when the target address is already a live login for another account. Supports `--dry-run` and `--remote`; interpolates nothing outside a pattern allow-list.
  - `--config` is required in practice on a clean checkout: `wrangler.jsonc` is gitignored and per-deployer, and `wrangler.template.jsonc` cannot be substituted because its placeholder `database_id` takes precedence over the `--db` name (wrangler then 404s on `00000000-…`). For ops-only D1 work, write a minimal config with the real `database_id` to `.wrangler/` (gitignored) and pass `--config .wrangler/<name>.jsonc` — do **not** leave a half-populated `wrangler.jsonc` at the repo root, because `wrangler deploy` would then omit the DO/KV/Secrets Store bindings.

## Required vars (no defaults)

`POLICY_AUD`, `TEAM_DOMAIN` — Cloudflare Access JWT verification, now `@rexezuge/http`'s `authenticateAccess`. No default; requests fail without them.

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

`PROVIDER_REQUEST_TIMEOUT_MS` reaches every outbound provider call: it is passed as
`ProviderRequest.timeoutMs` into `IHttpClient.fetchRaw`, and `SnsDeliveryUtil.publish` takes it
as its own argument because `aws4fetch` owns a separate signing client. It was previously parsed,
validated, documented, and read by nothing — a setting that silently did nothing. If you add a new
outbound call, thread `scope.config.providerRequestTimeoutMs` into it rather than adding another
hardcoded deadline.

Add new env vars as one entry in `SETTING_DESCRIPTORS` (`backend-runtime/src/config/AppConfig.ts`),
not inline. Each descriptor carries the key, a typed parser, and a numeric default, and
drives both parsing and the documented table above. Cross-setting invariants go in
`crossSettingWarnings`, which `validate()` composes with the per-value warnings the kit's
`AppConfiguration` already produces.

`DEBUG_MODE` is exactly `'true'`. The kit's family rule is presence-of-exactly-`true`, so `1`,
`yes`, `on` and `TRUE` are now **rejected** with a warning rather than treated as true. That is
a behaviour change from the previous broader spellings, and it is deliberate: a flag that reads
differently depending on how it was capitalised is a flag nobody can trust in an incident.

Values that are not safe integers, or that are not recognised booleans, fall back to the
default **and produce a warning** — a typo'd variable name is otherwise indistinguishable from
an unset one. Unrecognised `UPPER_SNAKE` keys also warn. Read configuration through
`scope.get(Tokens.Config)` (an `AppConfigReader`); do not read `env` directly for a tunable
setting.

## Dependency injection

`createRequestScope(env)` (`packages/backend-services/src/composition/requestScope.ts`) builds
every service for one request and returns a `@rexezuge/runtime` `Container`. Call sites resolve
through it: `scope.get(Tokens.UserService)`, `scope.get(Tokens.Config)`. The registry is
`composition/tokens.ts`.

- **Per request, never a module singleton.** The container closes over `env`, and one Worker
  isolate serves requests under different `env` values across deployments.
- **DAOs are registered as memoized factories.** That is what makes `ConnectedApplicationDAO`
  read the Secrets Store master key on first use rather than on every request.
- Unit tests resolve from a container built over fakes, or call the service directly with the
  same `*Deps` seam. Module mocks are not needed.

This replaced a hand-rolled `*Deps`-only composition root, which needed no registry but also
had no way to substitute one collaborator for a test without constructing all of them. The
`Container` is not a service locator here: every binding is resolved, and the binding count is
the size of `tokens.ts` rather than something that accumulates at each call site.

`AppConfigReader.fromEnv` does **not** throw on a bad value or a violated cross-setting
invariant — it returns `string[]` warnings from `validate()`. A misconfigured setting is a
startup log line, not a 500 storm, because a Worker that throws during config read takes down
every route including `/`.

`AppConfigReader` (`backend-runtime/src/config/AppConfig.ts`) is the only configuration
surface. There is no `AppConfiguration`, no `ConfigurationManager`, and no
`createServiceContext` — all three were removed along with the container, and the
`@mail-meow/backend-runtime` `exports` map no longer lists the deleted `./di` paths. A
reference to any of them is stale.
