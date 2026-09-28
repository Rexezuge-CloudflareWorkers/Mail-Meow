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
// Only the v3-onward chain is exercised: `0007_v3_reset_schema.sql` drops every table
// created by `0001`-`0006`, so replaying the pre-v3 migrations is wasted setup that
// only obscures the schema under test. Compare parsed numeric prefixes rather than
// raw filenames so `0011_...` sorts after `0009_...` instead of after `0010_...`.
const V3_MIGRATION_FLOOR = 7;
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .map((file) => ({ file, order: Number.parseInt(file, 10) }))
  .filter(({ order }) => Number.isSafeInteger(order) && order >= V3_MIGRATION_FLOOR)
  .sort((a, b) => a.order - b.order)
  .map(({ file }) => file);

if (migrationFiles.length === 0) {
  throw new Error(
    `No migrations at or after ${V3_MIGRATION_FLOOR} were found in ${migrationsDir}. ` +
      'Integration tests would run against an empty schema and fail with confusing "no such table" errors.',
  );
}
const migrationSql = migrationFiles.map((file) => readFileSync(resolve(migrationsDir, file), 'utf-8')).join('\n\n');

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
      include: ['apps/api/src/**/*.ts', 'apps/background/src/**/*.ts', 'packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.int.test.ts', '**/*.d.ts', '**/index.ts', '**/types.d.ts'],
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
    noExternal: ['hono', 'chanfana', '@mail-meow'],
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
