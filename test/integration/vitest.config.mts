import { defineConfig } from 'vitest/config';
import { cloudflareTest, cloudflarePool } from '@cloudflare/vitest-pool-workers';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const apiSrcPath = fileURLToPath(new URL('../../apps/api/src', import.meta.url));
const backgroundSrcPath = fileURLToPath(new URL('../../apps/background/src', import.meta.url));
const backendDataSrcPath = fileURLToPath(new URL('../../packages/backend-data/src', import.meta.url));
const backendErrorsSrcPath = fileURLToPath(new URL('../../packages/backend-errors/src', import.meta.url));
const backendRuntimeSrcPath = fileURLToPath(new URL('../../packages/backend-runtime/src', import.meta.url));
const providerClientsSrcPath = fileURLToPath(new URL('../../packages/provider-clients/src', import.meta.url));
const backendServicesSrcPath = fileURLToPath(new URL('../../packages/backend-services/src', import.meta.url));
const sharedSrcPath = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));

const migrationsDir = resolve(fileURLToPath(new URL('../../migrations', import.meta.url)));
const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql') && f >= '0007').sort();
const migrationSql = migrationFiles.map(f => readFileSync(resolve(migrationsDir, f), 'utf-8')).join('\n\n');

export default defineConfig({
  define: {
    __INTEGRATION_MIGRATION_SQL__: JSON.stringify(migrationSql),
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './test/integration/wrangler.test.jsonc',
      },
    }),
  ],
  test: {
    globals: true,
    include: ['test/integration/**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage-integration',
      include: [
        'apps/api/src/**/*.ts',
        'apps/background/src/**/*.ts',
        'packages/**/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.int.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/types.d.ts',
      ],
      // NOTE: V8 coverage instrumentation is not functional with @cloudflare/vitest-pool-workers
      // because the Cloudflare Workers sandbox does not expose node:inspector/promises.
      // Run `pnpm run test:integration` (without --coverage) for integration testing.
      // Coverage thresholds are omitted intentionally — they would always fail at 0%.
    },
    pool: cloudflarePool({
      wrangler: {
        configPath: './test/integration/wrangler.test.jsonc',
      },
    }),
  },
  ssr: {
    noExternal: [
      'hono',
      'chanfana',
      '@mail-meow',
    ],
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
      { find: /^@\//, replacement: `${apiSrcPath}/` },
    ],
  },
});
