import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { applyMigrations } from '../helpers/migrations';

describe('Processing visibility API', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('lists task runs via scope-resolved ProcessingService', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/processing/task-runs');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { runs: unknown[] };
    expect(Array.isArray(body.runs)).toBe(true);
  });

  it('rejects unsupported manual task types', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/processing/run-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskType: 'nope', applicationId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect([400, 404]).toContain(response.status);
  });
});
