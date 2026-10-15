# Mail-Meow — Testing

Scope: unit + integration tests. Parent index: `../../../AGENTS.md`.

## Layout

Two config files, because the two halves of this repo need different environments and a `.tsx`
test must not be able to run in the node project:

| Config                  | Command             | Environment | Includes                                                        | Setup                   |
| ----------------------- | ------------------- | ----------- | --------------------------------------------------------------- | ----------------------- |
| `vitest.config.mts`     | `pnpm run test`     | `node`      | `test/**/*.test.ts` (excludes `test/integration/`, `test/web/`) | `test/setup/backend.ts` |
| `vitest.web.config.mts` | `pnpm run test:web` | `jsdom`     | `test/web/**/*.test.{ts,tsx}`                                   | `test/setup/web.ts`     |

Both are `@rexezuge/tooling` factories (`defineUnitVitestConfig` / `defineWebVitestConfig`), so
the `@mail-meow/*` and `~` → `apps/web/src` aliases are derived rather than hand-listed. Run
either with `pnpm run test:all`.

They used to be two _projects_ inside the root `vitest.config.mts`. A project boundary inside
one file is a boundary nobody discovers: the SPA's environment, plugins and alias table sat 40
lines below the backend's, with no filename to point at. Two files means a failing web test
names its own harness.

`test/setup/web.ts` initializes i18next with the `en` bundle. Every component renders through
`useTranslation`, and without an initialized instance `t` returns `undefined`, so components
render empty and every query fails.

**`pnpm run typegen` is a prerequisite for `pnpm -r typecheck`.** `worker-configuration.d.ts`
is generated and gitignored. `pnpm install --ignore-scripts` skips the `postinstall` that
generates it, and typecheck then reports ~8 phantom errors (`Cannot find module
'cloudflare:workers'`, `Cannot find name 'ExecutionContext'`, and a cascade of
`Property 'ctx' does not exist`) that look like real breakage but are not. Run
`pnpm run typegen` before trusting a typecheck failure.

**A dependency of a leaf package needs an explicit alias to be mockable from `test/`.**
Under pnpm's isolated `node_modules` a package declared only by a leaf resolves from that
leaf alone, so a test at the repo root that imports it loads a _different_ module instance
than the code under test — and `vi.mock(...)` then silently does nothing, leaving the real
implementation running and the mock looking like the bug. `defineUnitVitestConfig`'s `aliases`
carries such an entry when one is needed; it used to pin `jose` for exactly this reason.

**`hono` and `chanfana` are in the config's `noExternal`, not in `aliases`.** Inlining rather
than aliasing is what keeps one copy of Hono in play: `apps/api` and `@rexezuge/http` must
resolve to the _same_ Hono, or a `MiddlewareHandler` from one is invisible to the other and
the middleware simply does not run — no error, no failing assertion. Two copies of Hono also
disagree about `Hono`'s trailing type parameters, which turns into an error at
`fromHono(app)` naming neither Hono nor a version.

## Thresholds

`vitest.config.mts`: **statements 73 / branches 59 / functions 82 / lines 73**.
Actual: 73.65 / 60.14 / 82.87 / 73.58.

The SDK adoption dipped branches (59.94 → 59.81) by adding real branching faster than tests.
The response was to test the new branches, not move the floor — and the floor is now above
where it started.

Raised from 60/45/60/60, which was itself raised from a 19/8/28/20 floor the dead-code removal
had made meaningless. This is an interim bar, not a destination — the long-term target is
88.5 / 76.5 / 90.5 / 89.5. Raise the numbers when you add tests, never lower them.

Exclusions: `**/*.test.ts`, `**/*.d.ts`, `**/types.d.ts`, `**/model/**`, `**/generated/**`.

**`**/index.ts` is deliberately NOT excluded.** It used to be, which is how four root barrels
(`shared`, `backend-data`, `backend-runtime`, `backend-services`) sat at 0% coverage while being
imported by literally nothing — every consumer uses a deep path like `@mail-meow/shared/utils`.
Excluding them is what made four dead files invisible. A barrel with no importer now shows up as
uncovered. Removing the exclusion is worth about 4 points of statements on its own.

**`@vitest/coverage-v8` must be pinned to the exact same version as `vitest`** (both
`4.1.11`): the provider declares an exact `vitest` peer, and a major mismatch breaks
silently — coverage-v8 5.x asserts a `coverageFilesDirectory` option that Vitest 4 core never
passes, so `takeCoverage()` throws once per test file, every file reports 0%, and all four
thresholds fail. `vitest` cannot move to 5.x while `@cloudflare/vitest-pool-workers` is
pinned, since that pool peers `vitest ^4.1.0` and powers the required `integration-tests` CI
job — bump the pool first, then both.

## Integration tests

`test/integration/` uses `@cloudflare/vitest-pool-workers`. **V8 coverage does not work
there** (the Workers sandbox exposes no `node:inspector/promises`), so no thresholds are
configured for that project.

`test/integration/self.ts` wraps the real Worker and injects a fixed AES-256 key for
`AES_ENCRYPTION_KEY_SECRET`. The real binding resolves against a Secrets Store, which a
local run cannot populate, so every encrypted code path would fail with
`Secret "test-aes-encryption-key" not found`. The key is a committed fixture, not a
credential.

Migrations are read from `migrations/` starting at `0007`: that file is the v3 reset and
drops everything `0001`–`0006` created, so replaying them is wasted setup. The filter parses
the numeric prefix rather than comparing filenames, and throws if nothing is found — an empty
migration set otherwise produces confusing "no such table" failures.

Each file is embedded separately (`__INTEGRATION_MIGRATION_FILES__`) and applied **one statement
at a time**, and `applyMigrations(db, {from, to})` applies a range. A range is what
`UserIdentityUpgrade.int.test.ts` needs: apply through `0010`, seed a populated legacy database,
then apply `0011` alone and assert nothing was lost. Do not switch to `db.batch()` per file — a
batch is prepared in full before the first statement runs, so a file that adds a column and
then creates a table referencing it fails with `foreign key mismatch` (see
`docs/agents/runtime/AGENTS.md`).

## Other guards

- `scripts/check-god-files.mjs` (soft 300 / hard 400 LOC).
- `apps/web/scripts/validate_locales.py` — run in CI. Checks **parity** (JSON-valid, key parity
  including no extra keys, `{{placeholder}}` parity, no empty values; 12 locales) **and usage**.
  The usage check is the one that matters and the one that was missing: parity alone reported
  `ALL OK` on a 29-key drift, because all twelve locales agreed with each other while disagreeing
  with the code. Eight keys the UI called (`header.menu`, `notice.dismiss`, the four
  `processing.*` column/loading keys) were defined in **no** locale, so they silently fell back
  to English in every language; seventeen were defined in all twelve and called by nothing. The
  script walks `apps/web/src` for `t('…')` calls, strips comments first, and keeps a
  `DYNAMIC_KEYS` allow-list for template-literal keys (`nav.${view}` in `Header.tsx`) that
  static extraction cannot see. **Extend that list when a component starts building key names**,
  or the validator will report a false failure.

## Mock patterns

- **DAOs**: `createMockDb()` from `test/helpers/mockDb.ts` returns a
  `prepare().bind().run/first/all` chain and records the SQL and bindings per statement.
  Use `statementAt(i)` when a method legitimately runs several statements.
  - The response queue is **per database, not per statement**: a create-then-read consumes
    responses in issue order, as the real binding does.
  - A queued `null` means "no row" and must not be coalesced to `{ results: [] }`.
- **Services**: pass fakes through the `*Deps` constructor seam. Module mocks are not
  needed, and are a sign the service is not injectable.
- **Routes**: `test/routes/routes.test.ts` drives the real assembled Hono app, mocking only
  the composition root and Cloudflare Access, so registration, validation, and the error
  mapper are all exercised.
- **External APIs**: mock provider client imports at package level; the HTTP layer takes an
  injectable `IHttpClient`.
- `vi.hoisted()` for mocks referenced across `vi.mock` factories.
- `beforeEach` + `vi.resetAllMocks()` — not `clearAllMocks`, which keeps implementations, so a
  `mockRejectedValue` from one test leaks into the next.
- **Clock**: prefer `vi.setSystemTime` over adding headroom to relative-time assertions.

## Still uncovered

`apps/background` Durable Objects end to end (`CronTasksWorker`, `OAuth2TokenRefreshWorker`),
the OpenAPI YAML route, and most of `SpaApp`'s composition. Backfill order: background DOs →
SpaApp → remaining routes. (`OAuth2AccessTokenRefreshTask` and `BackgroundTaskRunPruningTask`
are covered in `test/runtime/backgroundTasks.test.ts`.)
