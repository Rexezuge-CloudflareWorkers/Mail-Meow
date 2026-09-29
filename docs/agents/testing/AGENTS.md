# Mail-Meow — Testing

Scope: unit + integration tests. Parent index: `../../../AGENTS.md`.

## Layout

`vitest.config.mts` defines **two projects**, because the two halves of this repo need
different environments and a `.tsx` test must not be able to run in the node project:

| Project   | Environment | Includes                                                        | Setup                   |
| --------- | ----------- | --------------------------------------------------------------- | ----------------------- |
| `backend` | `node`      | `test/**/*.test.ts` (excludes `test/integration/`, `test/web/`) | `test/setup/backend.ts` |
| `web`     | `jsdom`     | `test/web/**/*.test.{ts,tsx}`                                   | `test/setup/web.ts`     |

Vitest projects do **not** inherit the root `resolve`, so the `@mail-meow/*` aliases are
declared explicitly in each project. The web project adds `~` → `apps/web/src`; `@` is
already the API worker's own alias.

`test/setup/web.ts` initializes i18next with the `en` bundle. Every component renders through
`useTranslation`, and without an initialized instance `t` returns `undefined`, so components
render empty and every query fails.

Run one project with `pnpm exec vitest run --project web`.

**`pnpm run typegen` is a prerequisite for `pnpm -r typecheck`.** `worker-configuration.d.ts`
is generated and gitignored. `pnpm install --ignore-scripts` skips the `postinstall` that
generates it, and typecheck then reports ~8 phantom errors (`Cannot find module
'cloudflare:workers'`, `Cannot find name 'ExecutionContext'`, and a cascade of
`Property 'ctx' does not exist`) that look like real breakage but are not. Run
`pnpm run typegen` before trusting a typecheck failure.

**A dependency of a leaf package needs an explicit alias to be mockable from `test/`.**
`jose` is declared by `backend-services`, so under pnpm's isolated `node_modules` it only
resolves from that package. A test at the repo root that imports `jose` loads a _different_
module instance than the service under test, and `vi.mock('jose')` then silently does
nothing — the real verifier runs, the test fails with a confusing `Invalid Compact JWS`, and
the mock looks like the bug. `vitest.config.mts` pins `jose` to one path for both. The same
applies to any future leaf-only dependency a test needs to mock.

## Thresholds

`vitest.config.mts`: **statements 60 / branches 45 / functions 60 / lines 60**.
Actual: 60.3 / 54.5 / 63.7 / 61.0.

Raised from the 19/8/28/20 floor this was sitting on, which the dead-code removal alone had
made meaningless. This is an interim bar, not a destination — the long-term target is
88.5 / 76.5 / 90.5 / 89.5. Raise the numbers when you add tests, never lower them.

Exclusions: `**/*.test.ts`, `**/*.d.ts`, `**/index.ts`, `**/types.d.ts`, `**/model/**`,
`**/generated/**`.

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
- `apps/web/scripts/validate_locales.py` (JSON-valid, key parity including no extra keys,
  `{{placeholder}}` parity, no empty values; 12 locales).

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
the PruningTask subclasses against real D1, the OpenAPI YAML route, and most of
`SpaApp`'s composition. Backfill order: background DOs → SpaApp → remaining routes.
