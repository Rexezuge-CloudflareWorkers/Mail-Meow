import { defineUnitVitestConfig } from '@rexezuge/tooling/vitest';

/**
 * The backend unit suite: resolver and coverage floors.
 *
 * This replaces a hand-written alias table that named every workspace package
 * and every `cloudflare:*` mock by absolute path. The factory derives both from
 * the scope and the package list, so a new workspace package needs no entry
 * here.
 *
 * The failure mode that motivated it is worth stating, because it is invisible
 * until it happens: a missing alias does not fail, it resolves. `@mail-meow/
 * shared/utils` with no alias loads the *installed* copy, the suite passes
 * against the wrong source, and the bug ships.
 *
 * ## Why `backend-data` and `provider-clients` are aliased but not separate suites
 *
 * They are collected by this one project rather than given their own. A package
 * per vitest project buys isolation this repo does not need — the DAOs are
 * exercised through the services that use them, and a project boundary would only
 * move the same tests behind another config.
 */
export default defineUnitVitestConfig({
  scope: '@mail-meow',
  /**
   * Every workspace package, plus `background` — which the factory resolves to
   * `apps/background/src` because it is an app rather than a package.
   *
   * `api` is absent: `apps/api` is reached through the `@/` alias, not by
   * package name.
   */
  packages: ['shared', 'backend-data', 'backend-runtime', 'backend-services', 'provider-clients', 'background'],
  root: new URL('.', import.meta.url).href,
  setupFiles: ['test/setup/backend.ts'],
  /**
   * `hono` and `chanfana` are inlined rather than externalized.
   *
   * `apps/api` and `@rexezuge/http` must share one Hono instance. Its router
   * types are nominal enough that two copies make a `MiddlewareHandler` from one
   * invisible to the other, and the symptom is a middleware that silently does
   * not run — no error, no failing assertion, just a rate limiter that was never
   * consulted.
   *
   * `chanfana` for the same reason: it re-exports Hono's router types, so two
   * copies of *it* produce two copies of those types too.
   */
  noExternal: ['hono', 'chanfana'],
  /**
   * The SPA suites live under `test/web`, not beside their components, so both
   * globs are replaced rather than merged with the factory's defaults. Those
   * defaults assume a repo whose component tests are co-located; this one's are
   * all collected from `test/`.
   */
  include: ['test/**/*.test.ts'],
  exclude: ['test/integration/**', 'test/web/**'],
  /**
   * `index.ts` barrels stay in the report.
   *
   * The kit's canonical exclude drops re-export barrels, on the reasoning that
   * they carry no logic of their own. That reasoning is wrong for a barrel
   * *nothing imports*: such a file is not unexercised logic, it is dead weight,
   * and excluding it is what hides it. Four entirely unused root barrels sat in
   * this repo at 0% coverage precisely because the glob covered them, and all
   * four turned out to have no importer at all.
   *
   * A barrel with no importer now shows up as uncovered, which is the only signal
   * that exists for one.
   */
  includeIndexBarrels: true,
  /**
   * Raised from 66/59/68/67, which were themselves raised from 60/45/60/60 after
   * the account-resolution, JWT, cron-task and i18n work.
   *
   * The SDK adoption *lowered* the branch percentage — 59.94 → 59.81 — because
   * it added real branching (three guards in `createUser`, the `validate()`
   * warning ladder, the token-keyed composition root) faster than it added tests.
   * The response was to test the new branches, not to move the floor down, so
   * the numbers below are the measured actuals and the floor is *above* where it
   * started. `pnpm run test:coverage` is what produced them.
   */
  thresholds: {
    statements: 73,
    branches: 59,
    functions: 82,
    lines: 73,
  },
});
