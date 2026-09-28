import {
  DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_EXCHANGE_URL,
  DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_REFRESH_URL,
} from '@mail-meow/backend-runtime/constants';
import type { OAuth2AccessTokenCacheDAO } from '@mail-meow/backend-data/dao';
import type { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { OAuth2TokenNonRetryableError, OAuth2TokenRetryableError } from '@mail-meow/backend-errors';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

interface OAuth2AccessTokenResult {
  accessToken: string;
  expiresAt: number;
  providerEmail?: string;
}

interface CompleteOAuth2AuthorizationInput {
  applicationId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

interface GetAccessTokenOptions {
  forceRefresh?: boolean;
  minValidSeconds?: number;
}

interface OAuth2AccessTokenServiceDeps {
  cacheDAO: () => Promise<OAuth2AccessTokenCacheDAO>;
  tokenRefreshers: () => DurableObjectNamespace;
  config: () => AppConfigReader;
}

class OAuth2AccessTokenService {
  constructor(private readonly deps: OAuth2AccessTokenServiceDeps) {}

  /**
   * Returns a usable access token, preferring the KV cache.
   *
   * A cached token is only accepted when at least `minValidSeconds` of life
   * remain, so a token cannot expire mid-request.
   */
  async getAccessToken(applicationId: string, options: GetAccessTokenOptions = {}): Promise<string> {
    const minValidSeconds: number = options.minValidSeconds ?? this.deps.config().oauth2AccessTokenMinValidSeconds;
    if (!options.forceRefresh) {
      const cacheDAO: OAuth2AccessTokenCacheDAO = await this.deps.cacheDAO();
      const cached = await cacheDAO.getCachedAccessToken(applicationId, minValidSeconds);
      if (cached) {
        return cached.accessToken;
      }
    }
    const result: OAuth2AccessTokenResult = await this.refreshAccessToken(applicationId, {
      forceRefresh: options.forceRefresh,
      minValidSeconds,
    });
    return result.accessToken;
  }

  async refreshAccessToken(applicationId: string, options: GetAccessTokenOptions = {}): Promise<OAuth2AccessTokenResult> {
    const minValidSeconds: number = options.minValidSeconds ?? this.deps.config().oauth2AccessTokenMinValidSeconds;
    return this.invokeTokenWorker(DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_REFRESH_URL, applicationId, {
      applicationId,
      forceRefresh: options.forceRefresh === true,
      minValidSeconds,
    });
  }

  async completeAuthorization(input: CompleteOAuth2AuthorizationInput): Promise<OAuth2AccessTokenResult> {
    return this.invokeTokenWorker(DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_EXCHANGE_URL, input.applicationId, {
      applicationId: input.applicationId,
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: input.codeVerifier,
    });
  }

  /**
   * Shards by application id so concurrent refreshes for the same mailbox are
   * serialized by the Durable Object rather than racing in this Worker.
   */
  private async invokeTokenWorker(url: string, applicationId: string, body: unknown): Promise<OAuth2AccessTokenResult> {
    const namespace: DurableObjectNamespace = this.deps.tokenRefreshers();
    const stub = namespace.get(namespace.idFromName(applicationId));
    const response: Response = await stub.fetch(new Request(url, { method: 'POST', body: JSON.stringify(body) }));
    const text: string = await response.text();

    let data: Partial<OAuth2AccessTokenResult> & { error?: string };
    try {
      data = text ? (JSON.parse(text) as Partial<OAuth2AccessTokenResult> & { error?: string }) : {};
    } catch {
      throw new OAuth2TokenRetryableError('OAuth2 token worker returned a malformed response.');
    }
    if (!response.ok || !data.accessToken || !data.expiresAt) {
      // The worker's own 5xx body is already sanitized; redact again in case an
      // older build or a stub put raw provider text in it.
      const detail: string = ErrorSanitizationUtil.sanitizeMessage(data.error || text || response.statusText);
      const message: string = `OAuth2 token worker failed: ${detail}`;
      // 4xx means the grant itself is bad (revoked, expired, wrong audience) and
      // will fail identically on retry.
      throw response.status >= 400 && response.status < 500
        ? new OAuth2TokenNonRetryableError(message)
        : new OAuth2TokenRetryableError(message);
    }
    return { accessToken: data.accessToken, expiresAt: data.expiresAt, providerEmail: data.providerEmail };
  }
}

export { OAuth2AccessTokenService };
export type { CompleteOAuth2AuthorizationInput, GetAccessTokenOptions, OAuth2AccessTokenResult, OAuth2AccessTokenServiceDeps };
