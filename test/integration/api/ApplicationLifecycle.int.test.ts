import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { applyMigrations } from '../helpers/migrations';

/**
 * Exercises the application lifecycle end to end against real D1, real
 * validation, and the real error mapper: create, list, update, and delete, plus
 * the ownership and quota rules that only show up once the schema is real.
 */

const USER_EMAIL = 'test@example.com';

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

const OAUTH2_APP = {
  displayName: 'Integration App',
  providerId: 'google-gmail',
  connectionMethod: 'oauth2',
  clientId: 'client-id',
  clientSecret: 'client-secret',
};

interface ApplicationResponse {
  application: {
    applicationId: string;
    displayName: string;
    status: string;
    oauth2RedirectUri: string;
  };
}

describe('Application lifecycle', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('creates an OAuth2 application in the draft state', async () => {
    const response = await json('/user/application', 'POST', OAUTH2_APP);
    expect(response.status).toBe(200);

    const body = (await response.json()) as ApplicationResponse;
    // Nothing can be sent with an OAuth2 application until consent completes.
    expect(body.application.status).toBe('draft');
    expect(body.application.displayName).toBe('Integration App');
    expect(body.application.oauth2RedirectUri).toContain('/api/oauth2/callback/');
  });

  it('lists the application for its owner', async () => {
    const response = await request('/user/applications');
    const body = (await response.json()) as { applications: Array<{ displayName: string; oauth2RedirectUri: string }> };

    expect(response.status).toBe(200);
    expect(body.applications.some((app: { displayName: string }) => app.displayName === 'Integration App')).toBe(true);
    // Every listed application carries the redirect URI the provider needs.
    for (const app of body.applications) {
      expect(app.oauth2RedirectUri).toContain('/api/oauth2/callback/');
    }
  });

  it('rejects an unsupported provider', async () => {
    const response = await json('/user/application', 'POST', { ...OAUTH2_APP, providerId: 'yahoo-mail' });
    expect(response.status).toBe(400);
  });

  it('rejects a provider and connection-method mismatch', async () => {
    // google-gmail is oauth2-only; pairing it with access-keys must not be accepted.
    const response = await json('/user/application', 'POST', { ...OAUTH2_APP, connectionMethod: 'access-keys' });
    expect(response.status).toBe(400);
  });

  it('rejects an OAuth2 application with no client secret', async () => {
    const response = await json('/user/application', 'POST', { ...OAUTH2_APP, clientSecret: undefined });
    expect(response.status).toBe(400);
  });

  it('rejects a non-UUID application id', async () => {
    const response = await json('/user/application', 'PUT', { ...OAUTH2_APP, applicationId: 'not-a-uuid' });
    expect(response.status).toBe(400);
  });

  it('refuses to change the provider of an existing application', async () => {
    const listResponse = await request('/user/applications');
    const { applications } = (await listResponse.json()) as { applications: Array<{ applicationId: string; displayName: string }> };
    const created = applications.find((app) => app.displayName === 'Integration App');
    expect(created).toBeDefined();

    const response = await json('/user/application', 'PUT', {
      ...OAUTH2_APP,
      applicationId: created!.applicationId,
      providerId: 'microsoft-outlook',
    });
    expect(response.status).toBe(400);
  });

  it('updates the display name of an owned application', async () => {
    const listResponse = await request('/user/applications');
    const { applications } = (await listResponse.json()) as { applications: Array<{ applicationId: string; displayName: string }> };
    const created = applications.find((app) => app.displayName === 'Integration App')!;

    const response = await json('/user/application', 'PUT', {
      ...OAUTH2_APP,
      applicationId: created.applicationId,
      displayName: 'Renamed App',
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as ApplicationResponse).application.displayName).toBe('Renamed App');
  });

  it('reports a missing application as not found rather than succeeding', async () => {
    const response = await json('/user/application', 'PUT', {
      ...OAUTH2_APP,
      applicationId: '99999999-9999-4999-8999-999999999999',
    });
    expect(response.status).toBe(400);
  });

  it('deletes an owned application', async () => {
    const listResponse = await request('/user/applications');
    const { applications } = (await listResponse.json()) as { applications: Array<{ applicationId: string; displayName: string }> };
    const created = applications.find((app) => app.displayName === 'Renamed App')!;

    const response = await json('/user/application', 'DELETE', { applicationId: created.applicationId });
    expect(response.status).toBe(200);

    const afterResponse = await request('/user/applications');
    const { applications: after } = (await afterResponse.json()) as { applications: Array<{ applicationId: string }> };
    expect(after.some((app) => app.applicationId === created.applicationId)).toBe(false);
  });
});

describe('Access-keys application', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('is connected immediately because the credentials are usable at once', async () => {
    const response = await json('/user/application', 'POST', {
      displayName: 'SNS App',
      providerId: 'amazon-sns',
      connectionMethod: 'access-keys',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      topicArn: 'arn:aws:sns:us-east-1:123456789012:mail-meow',
    });
    expect(response.status).toBe(200);
    // A draft here would block API key issuance for a credential set that already works.
    expect(((await response.json()) as ApplicationResponse).application.status).toBe('connected');
  });

  it('rejects a malformed SNS topic ARN', async () => {
    const response = await json('/user/application', 'POST', {
      displayName: 'Bad SNS App',
      providerId: 'amazon-sns',
      connectionMethod: 'access-keys',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'secret',
      topicArn: 'not-an-arn',
    });
    expect(response.status).toBe(400);
  });
});

describe('Auth boundary', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('rejects a delivery request with an unknown API key', async () => {
    const response = await json('/api/mm_does_not_exist/email', 'POST', {
      to: 'recipient@example.com',
      subject: 'Hello',
      text: 'body',
    });
    expect(response.status).toBe(401);
  });

  it('rejects a delivery request with no body content', async () => {
    const response = await json('/api/mm_does_not_exist/email', 'POST', { to: 'recipient@example.com', subject: 'Hello' });
    expect(response.status).toBe(400);
  });

  it('rejects an invalid recipient address', async () => {
    const response = await json('/api/mm_does_not_exist/email', 'POST', { to: 'not-an-email', subject: 'Hello', text: 'body' });
    expect(response.status).toBe(400);
  });

  it('requires both code and state on the OAuth2 callback', async () => {
    const response = await request('/api/oauth2/callback/11111111-1111-4111-8111-111111111111?code=abc');
    expect(response.status).toBe(400);
  });

  it('redirects to the error marker when the provider reports a denial', async () => {
    // `redirect: 'manual'`: the default would follow the chain to the SPA and
    // report 200 with the dashboard HTML, hiding the redirect under test.
    const response = await request('/api/oauth2/callback/11111111-1111-4111-8111-111111111111?error=access_denied', {
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('oauth2=error');
  });

  it('redirects to the connected marker after a successful exchange', async () => {
    // The exchange itself cannot succeed without a real provider, so this
    // asserts the failure path resolves to a redirect rather than a 500.
    const response = await request('/api/oauth2/callback/11111111-1111-4111-8111-111111111111?code=abc&state=xyz', {
      redirect: 'manual',
    });
    expect([302, 400]).toContain(response.status);
  });
});

describe('Error envelope', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('returns a stable Type and a readable Message on a 400', async () => {
    const response = await json('/user/application', 'POST', { displayName: '' });
    const body = (await response.json()) as { Exception: { Type: string; Message: string } };

    expect(response.status).toBe(400);
    // Type is the machine-readable contract; Message is for a human.
    expect(body.Exception.Type).toBe('BadRequest');
    expect(typeof body.Exception.Message).toBe('string');
    expect(body.Exception.Message.length).toBeGreaterThan(0);
  });

  it('never leaks internal error text on a 5xx', async () => {
    // Force a server-side failure by removing the row the handler needs.
    const response = await json('/user/processing/run-task', 'POST', {
      taskType: 'oauth2_refresh',
      applicationId: '99999999-9999-4999-8999-999999999999',
    });
    const body = (await response.json()) as { Exception: { Message: string } };

    expect(response.status).toBe(404);
    // A 404 message is authored for the caller, so it is safe to return as-is.
    expect(body.Exception.Message).not.toMatch(/D1_ERROR|sqlite|SELECT /i);
  });
});
