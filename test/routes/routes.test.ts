import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailMeowWorker } from '@/workers/MailMeowWorker';
import type { AccountIdentity } from '@mail-meow/shared/model';

/**
 * Route tests drive the real assembled Hono app, so registration, the auth
 * middleware, request validation, and error mapping are all exercised together
 * rather than mocked away.
 */

const hoisted = vi.hoisted(() => ({
  resolveApplication: vi.fn(),
  upsertUser: vi.fn(),
  getPreferredLanguage: vi.fn(),
  getCurrentUserSummary: vi.fn(),
  updatePreferredLanguage: vi.fn(),
  createApplication: vi.fn(),
  listApplications: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  createAuthorization: vi.fn(),
  completeCallback: vi.fn(),
  listTaskRuns: vi.fn(),
  triggerTask: vi.fn(),
  sendEmailForApplication: vi.fn(),
  publishForApplication: vi.fn(),
  authenticatedEmail: 'me@example.com',
  getAuthenticatedUserEmail: vi.fn(),
}));

vi.mock('@mail-meow/backend-services/auth', () => ({
  EmailValidationUtil: {
    getAuthenticatedUserEmail: hoisted.getAuthenticatedUserEmail,
  },
}));

/**
 * The composition root is replaced wholesale: route tests care about routing,
 * validation, and response shaping, not about DAO wiring (covered by the service
 * and DAO suites). Asserting `scope.apiKeys` is reached at all is the
 * interaction that matters here.
 */
vi.mock('@mail-meow/backend-services/composition', () => {
  const config = new Proxy(
    {},
    {
      get: (_target, property: string) => {
        const defaults: Record<string, number | boolean> = {
          maxApplicationsPerUser: 99,
          maxApiKeysPerApplication: 5,
          defaultApiKeyExpiryDays: 365,
          maxApiKeyExpiryDays: 365,
        };
        return defaults[property] ?? 1;
      },
    },
  ) as never;

  return {
    createRequestScope: () => ({
      config,
      apiKeys: {
        resolveApplication: hoisted.resolveApplication,
        listApiKeys: hoisted.listApiKeys,
        createApiKey: hoisted.createApiKey,
        deleteApiKey: hoisted.deleteApiKey,
      },
      applications: {
        createApplication: hoisted.createApplication,
        listApplications: hoisted.listApplications,
        updateApplication: hoisted.updateApplication,
        deleteApplication: hoisted.deleteApplication,
      },
      users: {
        upsertUser: hoisted.upsertUser,
        getPreferredLanguage: hoisted.getPreferredLanguage,
        getCurrentUserSummary: hoisted.getCurrentUserSummary,
        updatePreferredLanguage: hoisted.updatePreferredLanguage,
      },
      oauth2Authorization: { createAuthorization: hoisted.createAuthorization, completeCallback: hoisted.completeCallback },
      processing: { listTaskRuns: hoisted.listTaskRuns, triggerTask: hoisted.triggerTask },
      mailDelivery: { sendEmailForApplication: hoisted.sendEmailForApplication },
      sns: { publishForApplication: hoisted.publishForApplication },
    }),
  };
});

/**
 * The account the auth middleware resolves the asserted address to. Every
 * user-keyed call now receives this instead of a bare email string.
 */
const ACCOUNT: AccountIdentity = {
  id: 'usr_0123456789abcdef0123456789abcdef',
  email: 'me@example.com',
  anchorEmail: 'me@example.com',
};

const APP_ID = '11111111-1111-4111-8111-111111111111';
const KEY_ID = '22222222-2222-4222-8222-222222222222';

const APPLICATION = {
  applicationId: APP_ID,
  userEmail: 'me@example.com',
  displayName: 'My App',
  providerId: 'google-gmail',
  connectionMethod: 'oauth2',
  status: 'connected',
  createdAt: 1,
  updatedAt: 2,
};

const ENV = {
  DB: {},
  AES_ENCRYPTION_KEY_SECRET: { get: async () => 'k' },
  OAUTH2_TOKEN_CACHE: {},
  OAUTH2_TOKEN_REFRESHERS: {},
  MAX_APPLICATIONS_PER_USER: '99',
  MAX_API_KEYS_PER_APPLICATION: '5',
  DEFAULT_API_KEY_EXPIRY_DAYS: '365',
  MAX_API_KEY_EXPIRY_DAYS: '365',
  OAUTH2_STATE_EXPIRY_MINUTES: '15',
  OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS: '900',
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS: '60',
  OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS: '3600',
  OAUTH2_TOKEN_REFRESH_BATCH_SIZE: '25',
  BACKGROUND_TASK_RUN_RETENTION_DAYS: '30',
  CRON_TASKS: {},
  OAUTH2_TOKEN_REFRESHERS_DO: {},
} as unknown as Env;

const worker = new MailMeowWorker();

function call(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, 'https://example.com');
  return (worker as unknown as { app: { fetch(r: Request, e: unknown, c: unknown): Promise<Response> } }).app.fetch(
    new Request(url, init),
    ENV,
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
  );
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
}

async function callJson(path: string, body: unknown, method = 'POST'): Promise<{ status: number; body: unknown }> {
  const response = await call(path, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: the latter keeps implementations, so a
  // mockRejectedValue from one test would leak into the next.
  vi.resetAllMocks();
  // Restated here because resetAllMocks also clears the implementations of the
  // mocks declared inside vi.mock factories.
  hoisted.getAuthenticatedUserEmail.mockResolvedValue(hoisted.authenticatedEmail);
  hoisted.resolveApplication.mockResolvedValue(APPLICATION);
  hoisted.listApplications.mockResolvedValue([APPLICATION]);
  hoisted.getPreferredLanguage.mockResolvedValue('en');
  hoisted.upsertUser.mockResolvedValue(ACCOUNT);
  hoisted.listApiKeys.mockResolvedValue([]);
  hoisted.listTaskRuns.mockResolvedValue({ runs: [] });
  hoisted.publishForApplication.mockResolvedValue('message-1');
  hoisted.sendEmailForApplication.mockResolvedValue(undefined);
  hoisted.triggerTask.mockResolvedValue(undefined);
  hoisted.completeCallback.mockResolvedValue(undefined);
  hoisted.deleteApplication.mockResolvedValue(undefined);
  hoisted.deleteApiKey.mockResolvedValue(undefined);
  hoisted.updatePreferredLanguage.mockResolvedValue('de');
  hoisted.updateApplication.mockResolvedValue({ ...APPLICATION, oauth2RedirectUri: 'https://example.com/cb' });
  hoisted.createApplication.mockResolvedValue({ ...APPLICATION, oauth2RedirectUri: 'https://example.com/cb' });
  hoisted.createApiKey.mockResolvedValue({ metadata: { apiKeyId: KEY_ID }, apiKey: 'mm_plaintext' });
  hoisted.createAuthorization.mockResolvedValue({
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    redirectUri: 'https://example.com/cb',
    expiresAt: 1,
  });
});

describe('redirects and SPA fallback', () => {
  it('redirects the root to the user console', async () => {
    const response = await call('/');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/user/');
  });

  it('preserves the query string when redirecting the bare user path', async () => {
    const response = await call('/user?oauth2=connected');
    expect(response.headers.get('location')).toBe('/user/?oauth2=connected');
  });

  it('returns 404 for an unknown non-user path', async () => {
    const response = await call('/nope');
    expect(response.status).toBe(404);
  });

  it('answers a CORS preflight for the user routes', async () => {
    const response = await call('/user/me', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('GET /user/me', () => {
  it('returns the authenticated user with the effective limits', async () => {
    const response = await call('/user/me');
    const body = (await response.json()) as { id: string; email: string; preferredLanguage: string; limits: Record<string, number> };

    expect(response.status).toBe(200);
    // The id is the identity; the email is the current sign-in address.
    expect(body.id).toBe(ACCOUNT.id);
    expect(body.email).toBe('me@example.com');
    expect(body.preferredLanguage).toBe('en');
    expect(body.limits).toEqual({
      maxApplicationsPerUser: 99,
      maxApiKeysPerApplication: 5,
      defaultApiKeyExpiryDays: 365,
      maxApiKeyExpiryDays: 365,
    });
  });

  it('records the user on every authenticated request', async () => {
    await call('/user/me');
    expect(hoisted.upsertUser).toHaveBeenCalledWith('me@example.com');
  });

  it('passes the resolved account, not the bare address, to the services', async () => {
    // This is the seam the whole change rests on: a route must hand the DAOs an
    // id, or an address change would lock the user out of their own rows.
    await call('/user/applications');
    expect(hoisted.listApplications).toHaveBeenCalledWith(ACCOUNT);
  });

  it('falls back to an id-less account when the account cannot be resolved', async () => {
    // A database that has not run migration 0011. The id is empty and the DAOs
    // match on the address alone, so the request must still succeed.
    hoisted.upsertUser.mockResolvedValue(null);
    const response = await call('/user/applications');

    expect(response.status).toBe(200);
    expect(hoisted.listApplications).toHaveBeenCalledWith({
      id: '',
      email: 'me@example.com',
      anchorEmail: 'me@example.com',
    });
  });
});

describe('PUT /user/me', () => {
  it('rejects an unsupported language', async () => {
    const { status, body } = await callJson('/user/me', { preferredLanguage: 'xx' }, 'PUT');
    expect(status).toBe(400);
    expect(body).toMatchObject({ Exception: { Type: 'BadRequest' } });
  });

  it('accepts a supported language and returns the normalized form', async () => {
    hoisted.updatePreferredLanguage.mockResolvedValue('de');
    const { status, body } = await callJson('/user/me', { preferredLanguage: 'de' }, 'PUT');

    expect(status).toBe(200);
    expect(body).toMatchObject({ preferredLanguage: 'de' });
  });
});

describe('GET /user/applications', () => {
  it('returns the user applications with redirect URIs', async () => {
    const response = await call('/user/applications');
    const body = (await response.json()) as { applications: Array<{ oauth2RedirectUri: string }> };

    expect(response.status).toBe(200);
    expect(body.applications[0].oauth2RedirectUri).toContain('/api/oauth2/callback/');
  });
});

describe('POST /user/application', () => {
  it('rejects a body that violates the schema', async () => {
    const { status, body } = await callJson('/user/application', { displayName: 'x' });
    expect(status).toBe(400);
    expect(body).toMatchObject({ Exception: { Type: 'BadRequest' } });
  });

  it('creates an application and returns it', async () => {
    hoisted.createApplication.mockResolvedValue({ ...APPLICATION, oauth2RedirectUri: 'https://example.com/cb' });
    const { status, body } = await callJson('/user/application', {
      displayName: 'My App',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      clientId: 'a',
      clientSecret: 'b',
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ application: { applicationId: APP_ID } });
  });

  it('surfaces a service error with its own status', async () => {
    hoisted.createApplication.mockRejectedValue(new (await import('@mail-meow/backend-errors')).BadRequestError('Too many applications'));
    const { status, body } = await callJson('/user/application', {
      displayName: 'My App',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      clientId: 'a',
      clientSecret: 'b',
    });

    expect(status).toBe(400);
    expect(body).toMatchObject({ Exception: { Type: 'BadRequest', Message: 'Too many applications' } });
  });

  it('masks an untyped error as a generic 500', async () => {
    hoisted.createApplication.mockRejectedValue(new TypeError('undefined is not a function'));
    const { status, body } = await callJson('/user/application', {
      displayName: 'My App',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      clientId: 'a',
      clientSecret: 'b',
    });

    expect(status).toBe(500);
    expect(body).toMatchObject({ Exception: { Message: expect.not.stringContaining('undefined is not a function') } });
  });
});

describe('DELETE /user/application', () => {
  it('deletes an owned application', async () => {
    const { status } = await callJson('/user/application', { applicationId: APP_ID }, 'DELETE');
    expect(status).toBe(200);
    expect(hoisted.deleteApplication).toHaveBeenCalledWith(APP_ID, ACCOUNT);
  });
});

describe('API key routes', () => {
  it('lists keys for an application the caller owns', async () => {
    hoisted.listApiKeys.mockResolvedValue([]);
    const { status } = await call(`/user/application/api-keys?applicationId=${APP_ID}`);
    expect(status).toBe(200);
  });

  it('rejects a list request with no application id', async () => {
    const response = await call('/user/application/api-keys');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ Exception: { Type: 'BadRequest' } });
  });

  it('returns the plaintext key exactly once on create', async () => {
    hoisted.createApiKey.mockResolvedValue({ metadata: { apiKeyId: KEY_ID }, apiKey: 'mm_plaintext' });
    const { status, body } = await callJson('/user/application/api-key', { applicationId: APP_ID, name: 'CI' });

    expect(status).toBe(200);
    expect(body).toMatchObject({ apiKey: 'mm_plaintext', metadata: { apiKeyId: KEY_ID } });
  });

  it('revokes a key', async () => {
    const { status } = await callJson('/user/application/api-key', { apiKeyId: KEY_ID, applicationId: APP_ID }, 'DELETE');
    expect(status).toBe(200);
    expect(hoisted.deleteApiKey).toHaveBeenCalledWith(KEY_ID, APP_ID, ACCOUNT);
  });
});

describe('OAuth2 routes', () => {
  it('starts an authorization and returns the provider URL', async () => {
    hoisted.createAuthorization.mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      redirectUri: 'https://x/cb',
      expiresAt: 1,
    });
    const { status, body } = await callJson('/user/application/oauth2/authorize', { applicationId: APP_ID });

    expect(status).toBe(200);
    expect(body).toMatchObject({ authorizationUrl: expect.stringContaining('google.com') });
  });

  it('completes a callback and redirects on success', async () => {
    const response = await call(`/api/oauth2/callback/${APP_ID}?code=abc&state=xyz`);
    expect(response.status).toBe(302);
    // The applicationId is echoed so the SPA can reload the right list.
    expect(response.headers.get('location')).toContain('oauth2=connected');
    expect(response.headers.get('location')).toContain(`applicationId=${APP_ID}`);
  });

  it('redirects with an error marker when the provider reports one', async () => {
    const response = await call(`/api/oauth2/callback/${APP_ID}?error=access_denied`);
    expect(response.headers.get('location')).toContain('oauth2=error');
    expect(hoisted.completeCallback).not.toHaveBeenCalled();
  });

  it('responds with a client error when the exchange fails', async () => {
    // Only a provider-reported `error` redirects. A failed exchange is reported
    // as a normal 4xx so the caller sees why, rather than a bare redirect that
    // discards the reason.
    hoisted.completeCallback.mockRejectedValue(
      new (await import('@mail-meow/backend-errors')).BadRequestError('Session is invalid or expired.'),
    );
    const response = await call(`/api/oauth2/callback/${APP_ID}?code=abc&state=xyz`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ Exception: { Type: 'BadRequest' } });
  });

  it('rejects a callback with neither code nor state', async () => {
    const response = await call(`/api/oauth2/callback/${APP_ID}`);
    expect(response.status).toBe(400);
  });
});

describe('processing routes', () => {
  it('lists task runs for the authenticated user', async () => {
    hoisted.listTaskRuns.mockResolvedValue({ runs: [] });
    const { status } = await call('/user/processing/task-runs');
    expect(status).toBe(200);
  });

  it('delegates the task-type whitelist to the service', async () => {
    // The whitelist is the service's concern (see the ProcessingService tests);
    // the route's job is to validate and delegate.
    await callJson('/user/processing/run-task', { taskType: 'delete_everything', applicationId: APP_ID });
    expect(hoisted.triggerTask).toHaveBeenCalledWith(ACCOUNT, 'delete_everything', APP_ID);
  });

  it('surfaces a service rejection as a client error', async () => {
    hoisted.triggerTask.mockRejectedValue(new (await import('@mail-meow/backend-errors')).BadRequestError('cannot be triggered manually'));
    const { status, body } = await callJson('/user/processing/run-task', { taskType: 'delete_everything', applicationId: APP_ID });

    expect(status).toBe(400);
    expect(body).toMatchObject({ Exception: { Type: 'BadRequest' } });
  });

  it('rejects a body that violates the schema', async () => {
    const { status } = await callJson('/user/processing/run-task', { taskType: 'oauth2_refresh' });
    expect(status).toBe(400);
  });

  it('accepts the whitelisted task type', async () => {
    const { status, body } = await callJson('/user/processing/run-task', { taskType: 'oauth2_refresh', applicationId: APP_ID });
    expect(status).toBe(200);
    expect(body).toEqual({ triggered: true });
  });
});

describe('public delivery routes', () => {
  it('rejects an unresolvable API key', async () => {
    hoisted.resolveApplication.mockRejectedValue(new (await import('@mail-meow/backend-errors')).UnauthorizedError('API key is required.'));
    const response = await call('/api/mm_good/email', json({ to: 'recipient@example.com', subject: 'Hi', text: 'x' }));
    expect(response.status).toBe(401);
  });

  it('rejects a malformed body before touching the API key', async () => {
    // Validation runs first, so an invalid payload never reaches key resolution.
    const response = await call('/api/mm_good/email', json({ to: 'nope' }));
    expect(response.status).toBe(400);
  });

  it('rejects an invalid API key', async () => {
    hoisted.resolveApplication.mockRejectedValue(
      new (await import('@mail-meow/backend-errors')).UnauthorizedError('The API key is invalid or expired.'),
    );
    const response = await call('/api/mm_bad/email', json({ to: 'recipient@example.com', subject: 'Hi', text: 'x' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ Exception: { Type: 'Unauthorized' } });
  });

  it('resolves the application behind the key and sends', async () => {
    const response = await call('/api/mm_good/email', json({ to: 'recipient@example.com', subject: 'Hi', text: 'x' }));

    expect(response.status).toBe(200);
    expect(hoisted.resolveApplication).toHaveBeenCalledWith('mm_good');
    expect(hoisted.sendEmailForApplication).toHaveBeenCalledWith(APPLICATION, 'recipient@example.com', 'Hi', { text: 'x' });
  });

  it('rejects an email body that violates the schema', async () => {
    const response = await call('/api/mm_good/email', json({ to: 'not-an-email', subject: 'Hi', text: 'x' }));
    expect(response.status).toBe(400);
  });

  it('publishes to SNS', async () => {
    hoisted.publishForApplication.mockResolvedValue('message-1');
    const { status, body } = await callJson('/api/mm_good/sns', { message: 'hello' });

    expect(status).toBe(200);
    expect(body).toMatchObject({ messageId: 'message-1' });
  });
});
