import {
  DEFAULT_BACKGROUND_TASK_RUN_RETENTION_DAYS,
  DEFAULT_DEBUG_MODE,
  DEFAULT_DEFAULT_API_KEY_EXPIRY_DAYS,
  DEFAULT_MAX_API_KEYS_PER_APPLICATION,
  DEFAULT_MAX_API_KEY_EXPIRY_DAYS,
  DEFAULT_MAX_APPLICATIONS_PER_USER,
  DEFAULT_OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS,
  DEFAULT_OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS,
  DEFAULT_OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS,
  DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES,
  DEFAULT_OAUTH2_TOKEN_REFRESH_BATCH_SIZE,
} from './ConfigurationDefaults';
import { EnvParser } from './EnvParser';

class ConfigurationManager {
  public static readonly oauth2 = {
    getStateExpiryMinutes: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_STATE_EXPIRY_MINUTES', DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES),
    getAccessTokenRefreshWindowSeconds: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS),
    getAccessTokenMinValidSeconds: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS),
    getAccessTokenFallbackTtlSeconds: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS),
    getTokenRefreshBatchSize: (env: unknown): number => EnvParser.positiveInt(env, 'OAUTH2_TOKEN_REFRESH_BATCH_SIZE', DEFAULT_OAUTH2_TOKEN_REFRESH_BATCH_SIZE),
  };

  public static readonly limits = {
    getMaxApplicationsPerUser: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_APPLICATIONS_PER_USER', DEFAULT_MAX_APPLICATIONS_PER_USER),
    getMaxApiKeysPerApplication: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_API_KEYS_PER_APPLICATION', DEFAULT_MAX_API_KEYS_PER_APPLICATION),
  };

  public static readonly apikey = {
    getDefaultExpiryDays: (env: unknown): number => EnvParser.positiveInt(env, 'DEFAULT_API_KEY_EXPIRY_DAYS', DEFAULT_DEFAULT_API_KEY_EXPIRY_DAYS),
    getMaxExpiryDays: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_API_KEY_EXPIRY_DAYS', DEFAULT_MAX_API_KEY_EXPIRY_DAYS),
  };

  public static readonly processing = {
    getTaskRunRetentionDays: (env: unknown): number => EnvParser.positiveInt(env, 'BACKGROUND_TASK_RUN_RETENTION_DAYS', DEFAULT_BACKGROUND_TASK_RUN_RETENTION_DAYS),
  };

  public static getMaxApplicationsPerUser(env: unknown): number { return this.limits.getMaxApplicationsPerUser(env); }
  public static getMaxApiKeysPerApplication(env: unknown): number { return this.limits.getMaxApiKeysPerApplication(env); }
  public static getApiKeyExpiry(env: unknown): { defaultExpiryDays: number; maxExpiryDays: number } {
    return { defaultExpiryDays: this.apikey.getDefaultExpiryDays(env), maxExpiryDays: this.apikey.getMaxExpiryDays(env) };
  }
  public static getDebugMode(env: unknown): boolean { return EnvParser.boolean(env, 'DEBUG_MODE', DEFAULT_DEBUG_MODE); }
  public static getOauth2StateExpiryMinutes(env: unknown): number { return this.oauth2.getStateExpiryMinutes(env); }
  public static getOAuth2AccessTokenRefreshWindowSeconds(env: unknown): number { return this.oauth2.getAccessTokenRefreshWindowSeconds(env); }
  public static getOAuth2AccessTokenMinValidSeconds(env: unknown): number { return this.oauth2.getAccessTokenMinValidSeconds(env); }
  public static getOAuth2AccessTokenFallbackTtlSeconds(env: unknown): number { return this.oauth2.getAccessTokenFallbackTtlSeconds(env); }
  public static getOAuth2TokenRefreshBatchSize(env: unknown): number { return this.oauth2.getTokenRefreshBatchSize(env); }
  public static getTaskRunRetentionDays(env: unknown): number { return this.processing.getTaskRunRetentionDays(env); }
}

export { ConfigurationManager };
