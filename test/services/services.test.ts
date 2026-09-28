import { describe, expect, it, vi } from 'vitest';
import { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { ApiKeyService } from '@mail-meow/backend-services/apikey';
import { ApplicationService } from '@mail-meow/backend-services/application';
import { UserService } from '@mail-meow/backend-services/user';
import { ProcessingService } from '@mail-meow/backend-services/processing';
import { MailDeliveryService } from '@mail-meow/backend-services/email';
import { SnsDeliveryService } from '@mail-meow/backend-services/sns';
import { BadRequestError, NotFoundError, UnauthorizedError } from '@mail-meow/backend-errors';
import { BACKGROUND_TASK_TYPE_OAUTH2_REFRESH } from '@mail-meow/shared/constants';

/**
 * A config reader with selected values overridden.
 *
 * Built with a Proxy rather than object spread: `AppConfigReader` exposes its
 * settings as prototype getters, and spreading an instance copies nothing — the
 * overrides would silently read as `undefined` and every limit would compare
 * against `undefined`.
 */
function config(overrides: Record<string, number> = {}): AppConfigReader {
  const reader = AppConfigReader.fromEnv({});
  return new Proxy(reader, {
    get: (target, property: string, receiver): unknown =>
      property in overrides ? overrides[property] : Reflect.get(target, property, receiver),
  });
}

const APPLICATION = {
  applicationId: 'app-1',
  userEmail: 'me@example.com',
  displayName: 'My App',
  providerId: 'google-gmail',
  connectionMethod: 'oauth2',
  status: 'connected',
  createdAt: 1,
  updatedAt: 2,
  credentials: { clientId: 'a', clientSecret: 'b', refreshToken: 'r' },
};

/**
 * The authenticated caller, as the services now receive it: a stable id plus the
 * address. `anchorEmail` is what the DAOs fall back to on a pre-0011 database.
 */
const OWNER: AccountIdentity = { id: 'usr_0123456789abcdef0123456789abcdef', email: 'me@example.com', anchorEmail: 'me@example.com' };

const KEY_METADATA = {
  apiKeyId: 'key-1',
  applicationId: 'app-1',
  name: 'CI',
  keyPrefix: 'mm_test',
  keyLastFour: 'abcd',
  createdAt: 1,
  expiresAt: 9_999_999_999,
  lastUsedAt: null,
};

describe('ApiKeyService', () => {
  function build(overrides: { application?: unknown; apiKey?: unknown; cfg?: AppConfigReader } = {}) {
    const applicationDAO = {
      getById: vi.fn().mockResolvedValue(overrides.application === undefined ? APPLICATION : overrides.application),
      getByIdForUser: vi.fn().mockResolvedValue(overrides.application === undefined ? APPLICATION : overrides.application),
    };
    const apiKeyDAO = {
      getByHash: vi.fn().mockResolvedValue(KEY_METADATA),
      updateLastUsed: vi.fn().mockResolvedValue(undefined),
      listByApplication: vi.fn().mockResolvedValue([KEY_METADATA]),
      countByApplication: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(KEY_METADATA),
      deleteForApplication: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ApiKeyService({
      applicationDAO: () => Promise.resolve(applicationDAO as never),
      apiKeyDAO: () => Promise.resolve(apiKeyDAO as never),
      config: () => overrides.cfg ?? config(),
    });
    return { service, applicationDAO, apiKeyDAO };
  }

  it('rejects a missing key', async () => {
    const { service } = build();
    await expect(service.resolveApplication(undefined)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an unknown key', async () => {
    const { service, apiKeyDAO } = build();
    apiKeyDAO.getByHash.mockResolvedValue(undefined);
    await expect(service.resolveApplication('mm_bad')).rejects.toThrow(/invalid or expired/);
  });

  it('rejects a key whose application is gone', async () => {
    const { service, applicationDAO } = build({ application: undefined });
    applicationDAO.getById.mockResolvedValue(undefined);
    await expect(service.resolveApplication('mm_good')).rejects.toThrow(/not connected to an application/);
  });

  it('records that the key was used', async () => {
    const { service, apiKeyDAO } = build();
    await service.resolveApplication('mm_good');
    expect(apiKeyDAO.updateLastUsed).toHaveBeenCalledWith('key-1');
  });

  it('returns the resolved application', async () => {
    const { service } = build();
    await expect(service.resolveApplication('mm_good')).resolves.toMatchObject({ applicationId: 'app-1' });
  });

  it('refuses to issue a key for a draft application', async () => {
    const { service } = build({ application: { ...APPLICATION, status: 'draft' } });
    await expect(service.createApiKey('app-1', OWNER, 'CI')).rejects.toThrow(/must be connected/);
  });

  it('enforces the per-application key limit', async () => {
    const { service, apiKeyDAO } = build({ cfg: config({ maxApiKeysPerApplication: 1 }) });
    apiKeyDAO.countByApplication.mockResolvedValue(1);
    await expect(service.createApiKey('app-1', OWNER, 'CI')).rejects.toThrow(/Maximum 1 API keys/);
  });

  it('rejects an expiry beyond the configured maximum', async () => {
    const { service } = build({ cfg: config({ maxApiKeyExpiryDays: 30 }) });
    await expect(service.createApiKey('app-1', OWNER, 'CI', 90)).rejects.toThrow(/cannot exceed 30 days/);
  });

  it('falls back to the configured default expiry', async () => {
    const { service, apiKeyDAO } = build({ cfg: config({ defaultApiKeyExpiryDays: 7 }) });
    await service.createApiKey('app-1', OWNER, 'CI');
    expect(apiKeyDAO.create).toHaveBeenCalled();
  });

  it('returns the plaintext key exactly once', async () => {
    const { service } = build();
    const result = await service.createApiKey('app-1', OWNER, 'CI');
    expect(result.apiKey).toMatch(/^mm_/);
    expect(result.metadata.apiKeyId).toBe('key-1');
  });

  it('checks ownership before listing keys', async () => {
    const { service, applicationDAO } = build({ application: undefined });
    applicationDAO.getByIdForUser.mockResolvedValue(undefined);
    await expect(service.listApiKeys('app-1', OWNER)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('checks ownership before revoking a key', async () => {
    const { service, applicationDAO, apiKeyDAO } = build({ application: undefined });
    applicationDAO.getByIdForUser.mockResolvedValue(undefined);
    await expect(service.deleteApiKey('key-1', 'app-1', OWNER)).rejects.toBeInstanceOf(BadRequestError);
    expect(apiKeyDAO.deleteForApplication).not.toHaveBeenCalled();
  });
});

describe('ApplicationService', () => {
  function build(overrides: { existing?: unknown; count?: number; cfg?: AppConfigReader } = {}) {
    const dao = {
      countByUser: vi.fn().mockResolvedValue(overrides.count ?? 0),
      create: vi.fn().mockResolvedValue({ ...APPLICATION, credentials: undefined }),
      listMetadataByUser: vi.fn().mockResolvedValue([{ ...APPLICATION, credentials: undefined }]),
      getMetadataByIdForUser: vi
        .fn()
        .mockResolvedValue(overrides.existing === undefined ? { ...APPLICATION, credentials: undefined } : overrides.existing),
      updateForUser: vi.fn().mockResolvedValue({ ...APPLICATION, credentials: undefined }),
      deleteForUser: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ApplicationService({
      applicationDAO: () => Promise.resolve(dao as never),
      config: () => overrides.cfg ?? config(),
    });
    return { service, dao };
  }

  const RAW = new Request('https://example.com/user/application');

  it('enforces the per-user application limit', async () => {
    const { service } = build({ count: 99 });
    await expect(
      service.createApplication({
        user: OWNER,
        displayName: 'x',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        clientId: 'a',
        clientSecret: 'b',
        raw: RAW,
      }),
    ).rejects.toThrow(/Maximum 99 connected applications/);
  });

  it('creates an OAuth2 application as a draft', async () => {
    const { service, dao } = build();
    await service.createApplication({
      user: OWNER,
      displayName: 'x',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      clientId: 'a',
      clientSecret: 'b',
      raw: RAW,
    });
    expect(dao.create).toHaveBeenCalledWith(OWNER, 'x', 'google-gmail', 'oauth2', { clientId: 'a', clientSecret: 'b' }, 'draft');
  });

  it('creates an access-keys application as connected', async () => {
    // Access keys are usable the moment they are stored, so a draft would be
    // wrong and would block key issuance.
    const { service, dao } = build();
    await service.createApplication({
      user: OWNER,
      displayName: 'x',
      providerId: 'amazon-sns',
      connectionMethod: 'access-keys',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      topicArn: 'arn:aws:sns:us-east-1:1:topic',
      raw: RAW,
    });
    expect(dao.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'amazon-sns',
      'access-keys',
      expect.objectContaining({ accessKeyId: 'AK' }),
      'connected',
    );
  });

  it('returns the OAuth2 redirect URI alongside the created application', async () => {
    const { service } = build();
    const created = await service.createApplication({
      user: OWNER,
      displayName: 'x',
      providerId: 'google-gmail',
      connectionMethod: 'oauth2',
      clientId: 'a',
      clientSecret: 'b',
      raw: RAW,
    });
    expect(created.oauth2RedirectUri).toBe('https://example.com/api/oauth2/callback/app-1');
  });

  it('lists a user applications', async () => {
    const { service, dao } = build();
    await expect(service.listApplications(OWNER)).resolves.toHaveLength(1);
    expect(dao.listMetadataByUser).toHaveBeenCalledWith(OWNER);
  });

  it('rejects an update to a missing application', async () => {
    const { service, dao } = build({ existing: undefined });
    dao.getMetadataByIdForUser.mockResolvedValue(undefined);
    await expect(service.updateApplication('app-1', OWNER, 'x', 'google-gmail', 'oauth2', { clientId: 'a' }, 'draft', RAW)).rejects.toThrow(
      /was not found/,
    );
  });

  it('refuses to change the provider or connection method', async () => {
    const { service } = build({
      existing: { ...APPLICATION, providerId: 'google-gmail', connectionMethod: 'oauth2', credentials: undefined },
    });
    await expect(
      service.updateApplication('app-1', OWNER, 'x', 'microsoft-outlook', 'oauth2', { clientId: 'a' }, 'draft', RAW),
    ).rejects.toThrow(/cannot be changed after creation/);
  });

  it('deletes an application', async () => {
    const { service, dao } = build();
    await service.deleteApplication('app-1', OWNER);
    expect(dao.deleteForUser).toHaveBeenCalledWith('app-1', OWNER);
  });
});

describe('UserService', () => {
  const USER_ROW = {
    id: 'usr_0123456789abcdef0123456789abcdef',
    email: 'me@example.com',
    current_email: 'me@example.com',
    preferred_language: null,
    created_at: 100,
    updated_at: 200,
  };

  function build(options: { user?: unknown; registry?: unknown } = {}) {
    const userDAO = {
      createUser: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn().mockResolvedValue(options.user ?? null),
      getByEmail: vi.fn().mockResolvedValue(options.user ?? null),
      getByCurrentEmail: vi.fn().mockResolvedValue(options.user ?? null),
      updatePreferredLanguage: vi.fn().mockResolvedValue(undefined),
    };
    const userEmailDAO = {
      get: vi.fn().mockResolvedValue(options.registry ?? null),
      register: vi.fn().mockResolvedValue('claimed'),
    };
    const service = new UserService({
      userDAO: () => Promise.resolve(userDAO as never),
      userEmailDAO: () => Promise.resolve(userEmailDAO as never),
      config: () => config(),
    });
    return { service, userDAO, userEmailDAO };
  }

  it('returns the existing account without creating a second one', async () => {
    const { service, userDAO } = build({
      registry: { email: 'me@example.com', user_id: USER_ROW.id, is_verified: 1, created_at: 100 },
      user: USER_ROW,
    });

    await expect(service.upsertUser('me@example.com')).resolves.toEqual(OWNER);
    // Resolve-then-create: creating first would fork a duplicate for any address
    // that had been reassigned.
    expect(userDAO.createUser).not.toHaveBeenCalled();
  });

  it('registers a new account and claims its address', async () => {
    const { service, userDAO, userEmailDAO } = build();

    await service.upsertUser('new@example.com');

    expect(userDAO.createUser).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'new@example.com', loginEmail: 'new@example.com' }));
    // Claimed before resolving, or the fresh account is invisible to the registry.
    expect(userEmailDAO.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com', isVerified: true }));
  });

  it('lowercases the address, since Access may deliver mixed case', async () => {
    const { service, userDAO } = build();
    await service.upsertUser('  ME@Example.com  ');
    expect(userDAO.createUser).toHaveBeenCalledWith(expect.objectContaining({ loginEmail: 'me@example.com' }));
  });

  it("gives a revoked address a fresh account rather than the previous holder's", async () => {
    // The address moved to another account, so it no longer resolves — but Access
    // just authenticated whoever holds it *now*, so the correct outcome is a new
    // account, not a null and certainly not the previous holder's rows.
    const { service, userDAO, userEmailDAO } = build({
      registry: { email: 'me@example.com', user_id: 'usr_other', is_verified: 0, created_at: 100 },
    });

    await service.upsertUser('me@example.com');

    // Re-claimed for the new holder: the revoked row is re-pointed, not deleted.
    expect(userEmailDAO.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'me@example.com', isVerified: true }));
    // And the address is still the *previous* account's anchor, so the new
    // account takes an opaque one — otherwise the address could never be
    // released again.
    const anchors = userDAO.createUser.mock.calls.map((call) => (call[0] as { anchor: string }).anchor);
    expect(anchors).toContain('me@example.com');
    expect(anchors.some((anchor) => anchor.startsWith('anchor-'))).toBe(true);
  });

  it('resolves to null when neither the address nor an opaque retry can claim it', async () => {
    // A defensive floor: the caller must be able to distinguish "no account"
    // from "account created", so it can fail closed rather than proceed id-less.
    const { service } = build();
    await expect(service.upsertUser('new@example.com')).resolves.toBeNull();
  });

  it('returns null when no language is set', async () => {
    const { service } = build({ user: USER_ROW });
    await expect(service.getPreferredLanguage(OWNER)).resolves.toBeNull();
  });

  it('normalizes the stored language, reading by id', async () => {
    const { service, userDAO } = build({ user: { ...USER_ROW, preferred_language: 'de-DE' } });
    await expect(service.getPreferredLanguage(OWNER)).resolves.toBe('de');
    expect(userDAO.getById).toHaveBeenCalledWith(USER_ROW.id);
  });

  it('falls back to the anchor on a pre-0011 database', async () => {
    const { service, userDAO } = build({ user: { ...USER_ROW, preferred_language: 'fr' } });
    const preMigration: AccountIdentity = { id: '', email: 'me@example.com', anchorEmail: 'me@example.com' };
    await expect(service.getPreferredLanguage(preMigration)).resolves.toBe('fr');
    expect(userDAO.getByEmail).toHaveBeenCalledWith('me@example.com');
  });

  it('propagates a DAO failure rather than reporting "no language"', async () => {
    // This previously caught everything and returned null, so a D1 outage was
    // indistinguishable from a user who never chose a language.
    const { service, userDAO } = build();
    userDAO.getById.mockRejectedValue(new Error('D1 down'));

    await expect(service.getPreferredLanguage(OWNER)).rejects.toThrow('D1 down');
  });

  it('summarises the current user with the configured limit', async () => {
    const { service } = build({ user: { ...USER_ROW, preferred_language: 'fr' } });
    const summary = await service.getCurrentUserSummary(OWNER);
    expect(summary).toMatchObject({ id: USER_ROW.id, email: 'me@example.com', preferredLanguage: 'fr', maxApplicationsPerUser: 99 });
  });

  it('normalizes and stores an updated language against the account', async () => {
    const { service, userDAO } = build();
    await expect(service.updatePreferredLanguage(OWNER, 'zh-CN')).resolves.toBe('zh-CN');
    expect(userDAO.updatePreferredLanguage).toHaveBeenCalledWith(OWNER, 'zh-CN');
  });
});

describe('ProcessingService', () => {
  function build() {
    const taskRunDAO = { listForUser: vi.fn().mockResolvedValue({ runs: [] }) };
    const applicationDAO = { getByIdForUser: vi.fn().mockResolvedValue(APPLICATION) };
    const accessTokenService = { refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 't', expiresAt: 1 }) };
    const service = new ProcessingService({
      taskRunDAO: () => Promise.resolve(taskRunDAO as never),
      applicationDAO: () => Promise.resolve(applicationDAO as never),
      accessTokenService: () => accessTokenService as never,
    });
    return { service, taskRunDAO, applicationDAO, accessTokenService };
  }

  it('lists runs for the authenticated user', async () => {
    const { service, taskRunDAO } = build();
    await service.listTaskRuns(OWNER, {});
    // The user scoping is the DAO's job; the service passes the filters through.
    expect(taskRunDAO.listForUser.mock.calls[0][0]).toBe(OWNER);
  });

  it('implies latestPerType when no task type is given', async () => {
    const { service, taskRunDAO } = build();
    await service.listTaskRuns(OWNER, {});
    expect(taskRunDAO.listForUser.mock.calls[0][1].latestPerType).toBe(true);
  });

  it('does not imply latestPerType when a task type is given', async () => {
    const { service, taskRunDAO } = build();
    await service.listTaskRuns(OWNER, { taskType: 'oauth2_refresh' });
    expect(taskRunDAO.listForUser.mock.calls[0][1].latestPerType).toBe(false);
  });

  it('rejects a task type outside the whitelist', async () => {
    // The whitelist is the point: an unknown type must be rejected, not defaulted.
    const { service, accessTokenService } = build();
    await expect(service.triggerTask(OWNER, 'delete_everything', 'app-1')).rejects.toBeInstanceOf(BadRequestError);
    expect(accessTokenService.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a trigger for an application the caller does not own', async () => {
    const { service, applicationDAO } = build();
    applicationDAO.getByIdForUser.mockResolvedValue(undefined);
    await expect(service.triggerTask(OWNER, BACKGROUND_TASK_TYPE_OAUTH2_REFRESH, 'app-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forces a refresh for an owned application', async () => {
    const { service, accessTokenService } = build();
    await service.triggerTask(OWNER, BACKGROUND_TASK_TYPE_OAUTH2_REFRESH, 'app-1');
    expect(accessTokenService.refreshAccessToken).toHaveBeenCalledWith('app-1', { forceRefresh: true });
  });
});

describe('MailDeliveryService', () => {
  const applicationDAO = { updateOAuth2RefreshToken: vi.fn().mockResolvedValue(undefined) };
  const service = new MailDeliveryService({ applicationDAO: () => Promise.resolve(applicationDAO as never) });

  beforeEachReset();
  function beforeEachReset() {
    applicationDAO.updateOAuth2RefreshToken.mockClear();
  }

  it('refuses a draft application', async () => {
    await expect(service.sendEmailForApplication({ ...APPLICATION, status: 'draft' }, 'a@b.c', 'Hi', { text: 'x' })).rejects.toThrow(
      /not connected to an authorized OAuth2/,
    );
  });

  it('refuses a non-OAuth2 application', async () => {
    await expect(
      service.sendEmailForApplication({ ...APPLICATION, connectionMethod: 'access-keys' }, 'a@b.c', 'Hi', { text: 'x' }),
    ).rejects.toThrow(/not connected to an authorized OAuth2/);
  });
});

describe('SnsDeliveryService', () => {
  const service = new SnsDeliveryService();

  it('refuses a non-SNS application', async () => {
    await expect(service.publishForApplication(APPLICATION, 'message')).rejects.toThrow(/Amazon SNS access-key/);
  });

  it('refuses a draft SNS application', async () => {
    await expect(
      service.publishForApplication(
        { ...APPLICATION, providerId: 'amazon-sns', connectionMethod: 'access-keys', status: 'draft' },
        'message',
      ),
    ).rejects.toThrow(/Amazon SNS access-key/);
  });
});
