import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-meow/shared/constants';
import { BadRequestError } from '@mail-meow/backend-errors';
import type { OAuth2Credentials } from '@mail-meow/shared/model';
import { providerFetchJson } from './BaseProviderHttp';
import type { ProviderRequest } from './BaseProviderHttp';

interface OAuth2AuthorizationInput {
  providerId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

interface OAuth2TokenExchangeInput {
  providerId: string;
  credentials: OAuth2Credentials;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  /**
   * Outbound deadline, normally `AppConfigReader.providerRequestTimeoutMs`.
   * Omitted means the transport's own default.
   */
  timeoutMs?: number;
}

interface OAuth2RefreshInput {
  providerId: string;
  credentials: OAuth2Credentials;
  /**
   * See {@link OAuth2TokenExchangeInput.timeoutMs}.
   */
  timeoutMs?: number;
}

interface OAuth2TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

interface ProviderOAuth2Config {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scope: string;
  /**
   * Extra authorization-query parameters. `access_type=offline` is what makes
   * Google issue a refresh token at all; `response_mode=query` keeps the
   * Microsoft callback on the query string where `state` is read from.
   */
  extraAuthorizationParams: Record<string, string>;
  /**
   * Extra token-request form values. Microsoft expects the tenant in scope.
   */
  extraTokenParams: Record<string, string>;
}

const ProviderConfig: Record<string, ProviderOAuth2Config> = {
  [PROVIDER_GOOGLE_GMAIL]: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    extraAuthorizationParams: { access_type: 'offline', prompt: 'consent' },
    extraTokenParams: {},
  },
  [PROVIDER_MICROSOFT_OUTLOOK]: {
    authorizationEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    scope: 'https://graph.microsoft.com/Mail.Send offline_access',
    extraAuthorizationParams: { response_mode: 'query' },
    extraTokenParams: { scope: 'https://graph.microsoft.com/Mail.Send offline_access' },
  },
};

class OAuth2ProviderUtil {
  public static buildAuthorizationUrl(input: OAuth2AuthorizationInput): string {
    const config: ProviderOAuth2Config = this.getProviderConfig(input.providerId);
    const url: URL = new URL(config.authorizationEndpoint);
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scope);
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    for (const [key, value] of Object.entries(config.extraAuthorizationParams)) {
      url.searchParams.set(key, value);
    }
    return url.href;
  }

  public static async exchangeCode(input: OAuth2TokenExchangeInput): Promise<OAuth2TokenResult> {
    const config: ProviderOAuth2Config = this.getProviderConfig(input.providerId);
    const data: OAuth2TokenResponse = await this.postTokenRequest(
      input.providerId,
      config,
      {
        client_id: input.credentials.clientId,
        client_secret: input.credentials.clientSecret,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
      },
      input.timeoutMs,
    );
    if (!data.refresh_token) {
      throw new BadRequestError('OAuth2 provider did not return a refresh token. Reconnect and approve offline access.');
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: parseExpiresIn(data.expires_in),
    };
  }

  public static async refreshAccessToken(input: OAuth2RefreshInput): Promise<OAuth2TokenResult> {
    if (!input.credentials.refreshToken) {
      throw new BadRequestError('Connected application is not fully authorized.');
    }
    const config: ProviderOAuth2Config = this.getProviderConfig(input.providerId);
    const data: OAuth2TokenResponse = await this.postTokenRequest(
      input.providerId,
      config,
      {
        client_id: input.credentials.clientId,
        client_secret: input.credentials.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: input.credentials.refreshToken,
      },
      input.timeoutMs,
    );
    return {
      accessToken: data.access_token,
      // A refresh response may omit refresh_token, meaning "keep using the old one".
      refreshToken: data.refresh_token ?? input.credentials.refreshToken,
      expiresIn: parseExpiresIn(data.expires_in),
    };
  }

  public static getExpiresInSeconds(tokenResult: OAuth2TokenResult, fallbackTtlSeconds: number): number {
    return tokenResult.expiresIn && tokenResult.expiresIn > 0 ? tokenResult.expiresIn : fallbackTtlSeconds;
  }

  private static getProviderConfig(providerId: string): ProviderOAuth2Config {
    const config: ProviderOAuth2Config | undefined = ProviderConfig[providerId];
    if (!config) {
      throw new BadRequestError(`Unsupported OAuth2 provider: ${providerId}`);
    }
    return config;
  }

  private static async postTokenRequest(
    providerId: string,
    config: ProviderOAuth2Config,
    values: Record<string, string>,
    timeoutMs: number | undefined,
  ): Promise<OAuth2TokenResponse> {
    // Token requests are unauthenticated, so no bearer token is attached — but
    // they still go through the shared client for the timeout and the
    // status-before-parse ordering.
    const request: ProviderRequest = {
      providerName: 'OAuth2 token endpoint',
      operation: `exchange code (${providerId})`,
      // Passed through undefined rather than defaulted here, so the transport
      // owns the fallback and `PROVIDER_REQUEST_TIMEOUT_MS` reaches every
      // provider call through one path.
      timeoutMs,
    };
    const data: OAuth2TokenResponse | undefined = await providerFetchJson<OAuth2TokenResponse>(
      config.tokenEndpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...config.extraTokenParams, ...values }),
      },
      request,
    );
    if (!data?.access_token) {
      // Reached only when the provider returned 2xx without a token, which is a
      // contract violation rather than a transport problem.
      throw new BadRequestError('OAuth2 token endpoint returned a response without an access token.');
    }
    return data;
  }
}

/**
 * Providers report `expires_in` as either a number or a numeric string. Returns
 * `undefined` for anything that is not a finite positive number so callers fall
 * back to their configured TTL rather than caching a token for zero seconds.
 */
function parseExpiresIn(expiresIn: number | string | undefined): number | undefined {
  if (typeof expiresIn === 'number') {
    return Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : undefined;
  }
  if (typeof expiresIn === 'string') {
    const parsed: number = Number(expiresIn);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

interface OAuth2TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

export { OAuth2ProviderUtil, parseExpiresIn };
export type { OAuth2TokenResult, ProviderOAuth2Config };
