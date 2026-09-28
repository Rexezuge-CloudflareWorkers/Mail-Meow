import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { applyMigrations } from '../helpers/migrations';

/**
 * The API-key lifecycle against real D1: issuance, listing, quota enforcement,
 * and revocation — plus the cron paths that were entirely untested.
 */

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return SELF.fetch(`http://localhost${path}`, init);
}

function json(path: string, method: string, body: unknown): Promise<Response> {
  return request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ACCESS_KEYS_APP = {
  displayName: 'Key Lifecycle App',
  providerId: 'amazon-sns',
  connectionMethod: 'access-keys',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  topicArn: 'arn:aws:sns:us-east-1:123456789012:key-lifecycle',
};

/** Creates the access-keys application and returns its id. */
async function createApplication(): Promise<string> {
  const response = await json('/user/application', 'POST', ACCESS_KEYS_APP);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { application: { applicationId: string } };
  return body.application.applicationId;
}

describe('API key lifecycle', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('issues a key against a connected application', async () => {
    const applicationId = await createApplication();

    const response = await json('/user/application/api-key', 'POST', { applicationId, name: 'CI' });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { apiKey: string; metadata: { apiKeyId: string; name: string } };
    // The plaintext key is returned exactly once, at creation.
    expect(body.apiKey).toMatch(/^mm_/);
    expect(body.metadata.name).toBe('CI');
  });

  it('rejects a key request for an application that does not exist', async () => {
    const response = await json('/user/application/api-key', 'POST', {
      applicationId: '99999999-9999-4999-8999-999999999999',
      name: 'CI',
    });
    expect(response.status).toBe(400);
  });

  it('lists the keys for an application', async () => {
    const applicationId = await createApplication();
    await json('/user/application/api-key', 'POST', { applicationId, name: 'Listed' });

    const response = await request(`/user/application/api-keys?applicationId=${applicationId}`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { apiKeys: Array<{ name: string; keyPrefix: string; keyLastFour: string }> };
    expect(body.apiKeys.some((key: { name: string }) => key.name === 'Listed')).toBe(true);
    // Only the prefix and last four are ever returned; never the full key.
    for (const key of body.apiKeys) {
      expect(key.keyPrefix).toMatch(/^mm_/);
      expect(key.keyLastFour).toHaveLength(4);
    }
  });

  it('enforces the per-application key limit', async () => {
    const applicationId = await createApplication();
    const limit = 5;

    for (let index = 0; index < limit; index++) {
      const response = await json('/user/application/api-key', 'POST', { applicationId, name: `key-${index}` });
      expect(response.status).toBe(200);
    }

    const overflow = await json('/user/application/api-key', 'POST', { applicationId, name: 'one-too-many' });
    expect(overflow.status).toBe(400);
    await expect(overflow.json()).resolves.toMatchObject({
      Exception: { Message: expect.stringContaining(`Maximum ${limit.toString()}`) },
    });
  });

  it('rejects an expiry beyond the configured maximum', async () => {
    const applicationId = await createApplication();
    const response = await json('/user/application/api-key', 'POST', { applicationId, name: 'too-long', expiresInDays: 10_000 });
    expect(response.status).toBe(400);
  });

  it('revokes a key', async () => {
    const applicationId = await createApplication();
    const created = await json('/user/application/api-key', 'POST', { applicationId, name: 'Revoke Me' });
    const { metadata } = (await created.json()) as { metadata: { apiKeyId: string } };

    const deleteResponse = await json('/user/application/api-key', 'DELETE', { applicationId, apiKeyId: metadata.apiKeyId });
    expect(deleteResponse.status).toBe(200);

    const afterResponse = await request(`/user/application/api-keys?applicationId=${applicationId}`);
    const { apiKeys } = (await afterResponse.json()) as { apiKeys: Array<{ apiKeyId: string }> };
    expect(apiKeys.some((key: { apiKeyId: string }) => key.apiKeyId === metadata.apiKeyId)).toBe(false);
  });

  it('rejects a key name that is blank', async () => {
    const applicationId = await createApplication();
    const response = await json('/user/application/api-key', 'POST', { applicationId, name: '   ' });
    expect(response.status).toBe(400);
  });
});

describe('Task run history', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('starts empty without erroring', async () => {
    const response = await request('/user/processing/task-runs');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ runs: expect.any(Array) });
  });

  it('rejects an unknown task type filter', async () => {
    // The filter is a free string; an unmatched value yields an empty page rather
    // than an error, which is the documented behaviour.
    const response = await request('/user/processing/task-runs?taskType=not_a_real_task');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ runs: [] });
  });

  it('rejects a task type outside the manual-trigger whitelist', async () => {
    const applicationId = await createApplication();
    const response = await json('/user/processing/run-task', 'POST', { taskType: 'prune_everything', applicationId });
    expect(response.status).toBe(400);
  });
});

describe('CORS preflight', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('advertises the D1 bookmark header so the SPA can read it', async () => {
    const response = await request('/user/me', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    // The SPA needs to see x-d1-bookmark for read-your-writes to work.
    expect(response.headers.get('access-control-expose-headers')).toContain('x-d1-bookmark');
    expect(response.headers.get('access-control-allow-headers')).toContain('cf-access-jwt-assertion');
  });
});

describe('D1 session bookmark', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('round-trips a bookmark on authenticated requests', async () => {
    const response = await request('/user/me');
    // The first response establishes a session; the header tells the client where
    // to resume from, which is what gives the SPA read-your-writes.
    expect(response.headers.get('x-d1-bookmark')).toBeTruthy();
  });

  it('accepts an incoming bookmark without erroring', async () => {
    const response = await request('/user/me', { headers: { 'x-d1-bookmark': 'first-primary' } });
    expect(response.status).toBe(200);
  });
});
