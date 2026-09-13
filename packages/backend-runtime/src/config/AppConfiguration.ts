import { EnvParser } from './EnvParser';
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

class AppConfiguration {
  constructor(private readonly env: unknown) {}

  public static fromEnv(env: unknown): AppConfiguration {
    return new AppConfiguration(env);
  }

  public getMaxApplicationsPerUser(): number {
    return EnvParser.positiveInt(this.env, 'MAX_APPLICATIONS_PER_USER', DEFAULT_MAX_APPLICATIONS_PER_USER);
  }

  public getMaxApiKeysPerApplication(): number {
    return EnvParser.positiveInt(this.env, 'MAX_API_KEYS_PER_APPLICATION', DEFAULT_MAX_API_KEYS_PER_APPLICATION);
  }

  public getDefaultApiKeyExpiryDays(): number {
    return EnvParser.positiveInt(this.env, 'DEFAULT_API_KEY_EXPIRY_DAYS', DEFAULT_DEFAULT_API_KEY_EXPIRY_DAYS);
  }

  public getMaxApiKeyExpiryDays(): number {
    return EnvParser.positiveInt(this.env, 'MAX_API_KEY_EXPIRY_DAYS', DEFAULT_MAX_API_KEY_EXPIRY_DAYS);
  }

  public getOauth2StateExpiryMinutes(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_STATE_EXPIRY_MINUTES', DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES);
  }

  public getAccessTokenRefreshWindowSeconds(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS);
  }

  public getAccessTokenMinValidSeconds(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS);
  }

  public getAccessTokenFallbackTtlSeconds(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS', DEFAULT_OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS);
  }

  public getTokenRefreshBatchSize(): number {
    return EnvParser.positiveInt(this.env, 'OAUTH2_TOKEN_REFRESH_BATCH_SIZE', DEFAULT_OAUTH2_TOKEN_REFRESH_BATCH_SIZE);
  }

  public getTaskRunRetentionDays(): number {
    return EnvParser.positiveInt(this.env, 'BACKGROUND_TASK_RUN_RETENTION_DAYS', DEFAULT_BACKGROUND_TASK_RUN_RETENTION_DAYS);
  }

  public getDebugMode(): boolean {
    return EnvParser.boolean(this.env, 'DEBUG_MODE', DEFAULT_DEBUG_MODE);
  }
}

export { AppConfiguration };
