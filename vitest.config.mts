import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const apiSrcPath = fileURLToPath(new URL('apps/api/src', import.meta.url));
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

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: [
        'apps/api/src/**/*.ts',
        'apps/background/src/**/*.ts',
        'packages/**/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/types.d.ts',
        '**/model/**',
      ],
      thresholds: {
        // Baseline after Otter-pattern refactor; target Otter parity 88.5/76.5/90.5/89.5
        // as service/DAO/route/background coverage is backfilled (see docs/agents/testing/AGENTS.md).
        statements: 19,
        branches: 8,
        functions: 28,
        lines: 20,
      },
    },
  },
  resolve: {
    alias: [
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
      { find: /^@\//, replacement: `${apiSrcPath}/` },
    ],
  },
});
