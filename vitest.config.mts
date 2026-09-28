import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const apiSrcPath = fileURLToPath(new URL('apps/api/src', import.meta.url));
const webSrcPath = fileURLToPath(new URL('apps/web/src', import.meta.url));
const backgroundSrcPath = fileURLToPath(new URL('apps/background/src', import.meta.url));
const backendDataSrcPath = fileURLToPath(new URL('packages/backend-data/src', import.meta.url));
const backendErrorsSrcPath = fileURLToPath(new URL('packages/backend-errors/src', import.meta.url));
const backendRuntimeSrcPath = fileURLToPath(new URL('packages/backend-runtime/src', import.meta.url));
const providerClientsSrcPath = fileURLToPath(new URL('packages/provider-clients/src', import.meta.url));
const sharedSrcPath = fileURLToPath(new URL('packages/shared/src', import.meta.url));
const backendServicesSrcPath = fileURLToPath(new URL('packages/backend-services/src', import.meta.url));
const cloudflareSocketsMockPath = fileURLToPath(new URL('test/mocks/cloudflare-sockets.ts', import.meta.url));
const cloudflareWorkersMockPath = fileURLToPath(new URL('test/mocks/cloudflare-workers.ts', import.meta.url));
const cloudflareWorkflowsMockPath = fileURLToPath(new URL('test/mocks/cloudflare-workflows.ts', import.meta.url));
// `jose` is a dependency of `backend-services`, so under pnpm's isolated
// node_modules it only resolves from that package. A test file at the repo root
// resolving `jose` would therefore load a *different* module instance than the
// service under test, and `vi.mock('jose')` would silently not apply. Pinning
// both to one path is what makes the mock in `test/auth/` work.
const josePath = fileURLToPath(new URL('packages/backend-services/node_modules/jose', import.meta.url));

/**
 * Shared by both projects.
 *
 * Vitest projects do not inherit the root `resolve`, so each one has to be given
 * the aliases explicitly; without that, `@mail-meow/*` imports fail to resolve in
 * whichever project omits them.
 */
const workspaceAliases = [
  { find: '@mail-meow/background', replacement: backgroundSrcPath },
  { find: '@mail-meow/backend-data', replacement: backendDataSrcPath },
  { find: '@mail-meow/backend-errors', replacement: backendErrorsSrcPath },
  { find: '@mail-meow/backend-runtime', replacement: backendRuntimeSrcPath },
  { find: '@mail-meow/backend-services', replacement: backendServicesSrcPath },
  { find: '@mail-meow/provider-clients', replacement: providerClientsSrcPath },
  { find: '@mail-meow/shared', replacement: sharedSrcPath },
  { find: 'cloudflare:sockets', replacement: cloudflareSocketsMockPath },
  { find: 'cloudflare:workers', replacement: cloudflareWorkersMockPath },
  { find: 'cloudflare:workflows', replacement: cloudflareWorkflowsMockPath },
  { find: /^jose$/, replacement: josePath },
  { find: /^@\//, replacement: `${apiSrcPath}/` },
];

/**
 * Two projects, because the two halves of this repo need different environments
 * and a `.tsx` test must not be able to run in the node project (or vice versa).
 */
export default defineConfig({
  test: {
    projects: [
      {
        // Backend: plain TypeScript, node environment.
        resolve: { alias: workspaceAliases },
        test: {
          name: 'backend',
          globals: true,
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/integration/**', 'test/web/**'],
          setupFiles: ['test/setup/backend.ts'],
        },
      },
      {
        // SPA: jsdom plus the React plugin for JSX.
        //
        // `~` maps to apps/web/src. `@` is already claimed by the API worker's own
        // `@/*` alias, so the SPA uses a distinct prefix to keep the two apart.
        plugins: [react()],
        resolve: { alias: [{ find: '~', replacement: webSrcPath }, ...workspaceAliases] },
        test: {
          name: 'web',
          globals: true,
          environment: 'jsdom',
          include: ['test/web/**/*.test.{ts,tsx}'],
          setupFiles: ['test/setup/web.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['apps/api/src/**/*.ts', 'apps/background/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}', 'packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts', '**/index.ts', '**/types.d.ts', '**/model/**', '**/generated/**'],
      thresholds: {
        // Raised from the 19/8/28/20 floor after the dead-code removal and the
        // composition-root refactor. See docs/agents/testing/AGENTS.md.
        statements: 60,
        branches: 45,
        functions: 60,
        lines: 60,
      },
    },
  },
});
