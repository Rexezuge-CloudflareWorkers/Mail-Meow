import { describe, expect, it, vi } from 'vitest';
import { OAuth2AuthorizationService } from '@mail-meow/backend-services/oauth2';
import { OAuth2AccessTokenService } from '@mail-meow/backend-services/oauth2';
import { OAuth2StateUtil } from '@mail-meow/backend-services/oauth2';
import { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { BadRequestError, NotFoundError, OAuth2TokenNonRetryableError, OAuth2TokenRetryableError } from '@mail-meow/backend-errors';
import type { AccountIdentity } from '@mail-meow/shared/model';

const RAW = new Request('https://example.com/user/application/oauth2/authorize');

const OWNER: AccountIdentity = { id: 'usr_0123456789abcdef0123456789abcdef', email: 'me@example.com', anchorEmail: 'me@example.com' };

const SESSION = {
  sessionId: 'sess-1',
  applicationId: 'app-1',
  stateHash: 'hash',
  codeVerifier: 'verifier',
  redirectUri: 'https://example.com/api/oauth2/callback/app-1',
  createdAt: 1,
  expiresAt: 9_999_999_999,
  consumedAt: null,
};

const APPLICATION = {
  applicationId: 'app-1',
  userEmail: 'me@example.com',
  displayName: 'My App',
  providerId: 'google-gmail',
  connectionMethod: 'oauth2',
  status: 'draft',
  createdAt: 1,
  updatedAt: 2,
  credentials: { clientId: 'client-1', clientSecret: 'secret' },
};

function authorizationService(overrides: Record<string, unknown> = {}) {
  const applicationDAO = {
    getByIdForUser: vi.fn().mockResolvedValue(overrides.application === undefined ? APPLICATION : overrides.application),
    getById: vi.fn().mockResolvedValue(overrides.application === undefined ? APPLICATION : overrides.application),
  };
  const sessionDAO = {
    create: vi.fn().mockResolvedValue(undefined),
    getActive: vi.fn().mockResolvedValue('session' in overrides ? overrides.session : SESSION),
    consume: vi.fn().mockResolvedValue(overrides.consumeWins === undefined ? true : overrides.consumeWins),
  };
  const accessTokenService = { completeAuthorization: vi.fn().mockResolvedValue({ accessToken: 't', expiresAt: 1 }) };
  const service = new OAuth2AuthorizationService({
    applicationDAO: () => Promise.resolve(applicationDAO as never),
    sessionDAO: () => Promise.resolve(sessionDAO as never),
    accessTokenService: () => accessTokenService as never,
    config: () => AppConfigReader.fromEnv({}),
  });
  return { service, applicationDAO, sessionDAO, accessTokenService };
}

describe('OAuth2AuthorizationService.createAuthorization', () => {
  it('rejects an application the caller does not own', async () => {
    const { service, applicationDAO } = authorizationService();
    applicationDAO.getByIdForUser.mockResolvedValue(undefined);
    await expect(service.createAuthorization(OWNER, 'app-1', RAW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a non-OAuth2 application', async () => {
    const { service } = authorizationService({ application: { ...APPLICATION, connectionMethod: 'access-keys' } });
    await expect(service.createAuthorization(OWNER, 'app-1', RAW)).rejects.toThrow(/does not use OAuth2/);
  });

  it('persists a session and returns a provider authorization URL', async () => {
    const { service, sessionDAO } = authorizationService();

    const result = await service.createAuthorization(OWNER, 'app-1', RAW);

    expect(result.authorizationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(result.authorizationUrl).toContain('code_challenge_method=S256');
    expect(result.redirectUri).toBe('https://example.com/api/oauth2/callback/app-1');
    expect(sessionDAO.create).toHaveBeenCalledOnce();
  });

  it('never stores the raw state, only its hash', async () => {
    const { service, sessionDAO } = authorizationService();

    const result = await service.createAuthorization(OWNER, 'app-1', RAW);

    const stateParam = new URL(result.authorizationUrl).searchParams.get('state');
    const [, storedHash] = sessionDAO.create.mock.calls[0];
    // A leaked state would let anyone complete someone else's authorization.
    expect(stateParam).toBeTruthy();
    expect(storedHash).not.toBe(stateParam);
  });
});

describe('OAuth2AuthorizationService.completeCallback', () => {
  it('rejects an unknown or expired session', async () => {
    const { service, accessTokenService } = authorizationService({ session: undefined });
    await expect(service.completeCallback({ applicationId: 'app-1', code: 'c', state: 's' })).rejects.toBeInstanceOf(BadRequestError);
    expect(accessTokenService.completeAuthorization).not.toHaveBeenCalled();
  });

  it('rejects when the application has since been deleted', async () => {
    const { service, applicationDAO, sessionDAO } = authorizationService();
    applicationDAO.getById.mockResolvedValue(undefined);
    await expect(service.completeCallback({ applicationId: 'app-1', code: 'c', state: 's' })).rejects.toBeInstanceOf(NotFoundError);
    expect(sessionDAO.consume).not.toHaveBeenCalled();
  });

  it('rejects a replayed callback that lost the consume race', async () => {
    // The regression: consume() used to report success for the loser, and the
    // exchange ran first, so a replayed `state` could complete a second exchange.
    const { service, accessTokenService } = authorizationService({ consumeWins: false });

    await expect(service.completeCallback({ applicationId: 'app-1', code: 'c', state: 's' })).rejects.toThrow(/invalid or expired/);
    expect(accessTokenService.completeAuthorization).not.toHaveBeenCalled();
  });

  it('claims the session before exchanging the code', async () => {
    const order: string[] = [];
    const { service, sessionDAO, accessTokenService } = authorizationService();
    sessionDAO.consume.mockImplementation(() => {
      order.push('consume');
      return Promise.resolve(true);
    });
    accessTokenService.completeAuthorization.mockImplementation(() => {
      order.push('exchange');
      return Promise.resolve({ accessToken: 't', expiresAt: 1 });
    });

    await service.completeCallback({ applicationId: 'app-1', code: 'c', state: 's' });

    expect(order).toEqual(['consume', 'exchange']);
  });

  it('exchanges with the stored code verifier and redirect URI', async () => {
    const { service, accessTokenService } = authorizationService();

    await service.completeCallback({ applicationId: 'app-1', code: 'code-1', state: 's' });

    expect(accessTokenService.completeAuthorization).toHaveBeenCalledWith({
      applicationId: 'app-1',
      redirectUri: SESSION.redirectUri,
      code: 'code-1',
      codeVerifier: SESSION.codeVerifier,
    });
  });
});

describe('OAuth2AccessTokenService', () => {
  function accessTokenService(overrides: { cached?: unknown; fetchResult?: Response } = {}) {
    const cacheDAO = {
      getCachedAccessToken: vi.fn().mockResolvedValue(overrides.cached),
      storeAccessToken: vi.fn().mockResolvedValue(undefined),
    };
    const get = vi.fn().mockResolvedValue(overrides.fetchResult ?? Response.json({ accessToken: 'fresh', expiresAt: 200 }));
    const namespace = { idFromName: vi.fn().mockReturnValue('id'), get: vi.fn().mockReturnValue({ fetch: get }) };
    const service = new OAuth2AccessTokenService({
      cacheDAO: () => Promise.resolve(cacheDAO as never),
      tokenRefreshers: () => namespace as never,
      config: () => AppConfigReader.fromEnv({}),
    });
    return { service, cacheDAO, namespace, get };
  }

  it('prefers a cached token when one is valid', async () => {
    const { service, get } = accessTokenService({ cached: { accessToken: 'cached', expiresAt: 999 } });

    await expect(service.getAccessToken('app-1')).resolves.toBe('cached');
    expect(get).not.toHaveBeenCalled();
  });

  it('refreshes when the cache misses', async () => {
    const { service, get } = accessTokenService({ cached: undefined });

    await expect(service.getAccessToken('app-1')).resolves.toBe('fresh');
    expect(get).toHaveBeenCalled();
  });

  it('skips the cache entirely when a refresh is forced', async () => {
    const { service, cacheDAO } = accessTokenService({ cached: { accessToken: 'cached', expiresAt: 999 } });

    await service.getAccessToken('app-1', { forceRefresh: true });
    expect(cacheDAO.getCachedAccessToken).not.toHaveBeenCalled();
  });

  it('shards the Durable Object by application id', async () => {
    const { service, namespace } = accessTokenService({ cached: undefined });
    await service.getAccessToken('app-1');
    expect(namespace.idFromName).toHaveBeenCalledWith('app-1');
  });

  it('maps a 4xx from the token worker to a non-retryable error', async () => {
    const { service } = accessTokenService({
      cached: undefined,
      fetchResult: Response.json({ error: 'invalid_grant' }, { status: 400 }),
    });
    await expect(service.getAccessToken('app-1')).rejects.toBeInstanceOf(OAuth2TokenNonRetryableError);
  });

  it('maps a 5xx from the token worker to a retryable error', async () => {
    const { service } = accessTokenService({ cached: undefined, fetchResult: Response.json({ error: 'boom' }, { status: 503 }) });
    await expect(service.getAccessToken('app-1')).rejects.toBeInstanceOf(OAuth2TokenRetryableError);
  });

  it('rejects a malformed worker response rather than throwing a SyntaxError', async () => {
    const { service } = accessTokenService({ cached: undefined, fetchResult: new Response('{ not json', { status: 200 }) });
    await expect(service.getAccessToken('app-1')).rejects.toThrow(/malformed response/);
  });

  it('rejects a 2xx response with no token', async () => {
    const { service } = accessTokenService({ cached: undefined, fetchResult: Response.json({}, { status: 200 }) });
    await expect(service.getAccessToken('app-1')).rejects.toBeInstanceOf(OAuth2TokenRetryableError);
  });

  it('forces a refresh through the worker', async () => {
    const { service, get } = accessTokenService({ cached: undefined });
    await service.refreshAccessToken('app-1', { forceRefresh: true });

    const request = get.mock.calls[0][0] as Request;
    expect(request.url).toContain('/refresh');
    await expect(request.json()).resolves.toMatchObject({ applicationId: 'app-1', forceRefresh: true });
  });
});

describe('OAuth2StateUtil', () => {
  it('generates a state and a code verifier', () => {
    expect(OAuth2StateUtil.generateState()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(OAuth2StateUtil.generateCodeVerifier().length).toBeGreaterThanOrEqual(43);
  });

  it('derives an S256 challenge from the verifier', async () => {
    const verifier = OAuth2StateUtil.generateCodeVerifier();
    const challenge = await OAuth2StateUtil.getCodeChallenge(verifier);
    expect(challenge).not.toBe(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes the state so the raw value is never stored', async () => {
    const state = OAuth2StateUtil.generateState();
    const hash = await OAuth2StateUtil.getStateHash(state);
    expect(hash).not.toBe(state);
    // Deterministic, so a callback can look the session up again.
    await expect(OAuth2StateUtil.getStateHash(state)).resolves.toBe(hash);
  });
});
