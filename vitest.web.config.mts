import { defineWebVitestConfig } from '@rexezuge/tooling/vitest-web';
import react from '@vitejs/plugin-react';

/**
 * Unit tests for the SPA.
 *
 * These used to run in a second *project* inside the root `vitest.config.mts`.
 * A project boundary inside one file is a boundary nobody discovers: the SPA's
 * environment, plugins and alias table sat 40 lines below the backend's, with no
 * filename to point at. Two files means `pnpm run test:web` is a real command and
 * a failing web test names its own harness.
 *
 * `~` maps to `apps/web/src` and the jsdom environment are the kit's, so an SPA
 * file importing `~/lib/api` resolves the same way here as it does in
 * `vite build`. Before, the two harnesses each declared their own and could
 * disagree — which only ever shows up as a test that passes and a bundle that
 * does not build.
 *
 * `scope` is omitted: the SPA has no workspace packages of its own, and the
 * `cloudflare:*` mocks are unreachable from `lib/` and `services/`.
 */
export default defineWebVitestConfig({
  plugins: [react()],
  root: new URL('.', import.meta.url).href,
  /**
   * Collected from `apps/web` rather than `test/web`.
   *
   * The suites were already co-located next to what they test — there is no
   * a single `.test.tsx` under `apps/web`, and no reason to create one — so this is a
   * narrower glob, not a moved one.
   */
  include: ['test/web/**/*.test.{ts,tsx}'],
  setupFiles: ['test/setup/web.ts'],
  reportsDirectory: './coverage-web',
});
