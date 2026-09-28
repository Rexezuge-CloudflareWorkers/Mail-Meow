import worker from '../../apps/api/src/index';

/**
 * A deterministic AES-256 key for the integration suite.
 *
 * The real binding resolves against a Secrets Store, which a local test run has
 * no way to populate, so every encrypted code path failed with
 * `Secret "test-aes-encryption-key" not found`. The key is a fixture, not a
 * credential: it is committed, fixed, and used only by tests.
 */
const TEST_MASTER_KEY_BASE64 = 'bWFpbC1tZW93LWl0ZXN0LWZpeHR1cmUta2V5LTMyYnk=';

export default {
  fetch: (request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> =>
    worker.fetch(request, withTestSecrets(env) as never, ctx),
  scheduled: (event: ScheduledController, env: Record<string, unknown>, ctx: ExecutionContext): void =>
    worker.scheduled(event, withTestSecrets(env) as never, ctx),
  // Exported so a test can address the Durable Objects directly.
  CronTasksWorker: worker.CronTasksWorker,
  OAuth2TokenRefreshWorker: worker.OAuth2TokenRefreshWorker,
} as unknown as ExportedHandler<Record<string, unknown>>;

function withTestSecrets(env: Record<string, unknown>): Record<string, unknown> {
  return {
    ...env,
    AES_ENCRYPTION_KEY_SECRET: {
      get: (): Promise<string> => Promise.resolve(TEST_MASTER_KEY_BASE64),
    },
  };
}
