/**
 * One descriptor per setting: the env key, a typed parser, and a numeric default.
 *
 * Adding a setting means adding one entry here. Previously it meant editing
 * `ConfigurationDefaults`, `ConfigurationManager` (twice — once in a namespace
 * object, once as a top-level delegate), and `AppConfiguration`, which is how
 * three of the eleven settings ended up with no reader at all.
 */
interface SettingDescriptor<T> {
  /**
  Env var name. Also the key exposed on the resolved config.
  */
  key: string;
  /**
  Human-readable purpose, surfaced in warnings.
  */
  description: string;
  parse: (raw: string | undefined) => T;
  defaultValue: T;
}

function positiveInt(key: string, description: string, defaultValue: number): SettingDescriptor<number> {
  return {
    key,
    description,
    defaultValue,
    parse: (raw: string | undefined): number => {
      if (raw === undefined || raw.trim() === '') {
        return defaultValue;
      }
      const parsed: number = Number(raw);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        // Surfaced as a warning rather than thrown: one bad value should not stop
        // a Worker from serving traffic, but it must not be silently swallowed.
        console.warn(`Ignoring invalid positive integer for ${key}: ${raw}`);
        return defaultValue;
      }
      return parsed;
    },
  };
}

function booleanSetting(key: string, description: string, defaultValue: boolean): SettingDescriptor<boolean> {
  const TRUTHY = new Set(['true', '1', 'yes', 'on']);
  const FALSY = new Set(['false', '0', 'no', 'off']);
  return {
    key,
    description,
    defaultValue,
    parse: (raw: string | undefined): boolean => {
      if (raw === undefined) {
        return defaultValue;
      }
      const normalized: string = raw.trim().toLowerCase();
      if (TRUTHY.has(normalized)) {
        return true;
      }
      if (FALSY.has(normalized)) {
        return false;
      }
      console.warn(`Ignoring unrecognized boolean for ${key}: ${raw}`);
      return defaultValue;
    },
  };
}

const MAX_APPLICATIONS_PER_USER = positiveInt('MAX_APPLICATIONS_PER_USER', 'Connected applications a single user may create', 99);
const MAX_API_KEYS_PER_APPLICATION = positiveInt('MAX_API_KEYS_PER_APPLICATION', 'Live API keys per application', 5);
const DEFAULT_API_KEY_EXPIRY_DAYS = positiveInt('DEFAULT_API_KEY_EXPIRY_DAYS', 'Default API key lifetime in days', 365);
const MAX_API_KEY_EXPIRY_DAYS = positiveInt('MAX_API_KEY_EXPIRY_DAYS', 'Longest permitted API key lifetime in days', 365);
const OAUTH2_STATE_EXPIRY_MINUTES = positiveInt('OAUTH2_STATE_EXPIRY_MINUTES', 'Lifetime of a pending OAuth2 authorization session', 15);
const OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS = positiveInt(
  'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS',
  'Refresh a token this many seconds before it expires',
  900,
);
const OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS = positiveInt(
  'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS',
  'Treat a cached token as unusable below this remaining lifetime',
  60,
);
const OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS = positiveInt(
  'OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS',
  'Cache lifetime when the provider omits expires_in',
  3600,
);
const OAUTH2_TOKEN_REFRESH_BATCH_SIZE = positiveInt('OAUTH2_TOKEN_REFRESH_BATCH_SIZE', 'Applications refreshed per cron tick', 25);
const BACKGROUND_TASK_RUN_RETENTION_DAYS = positiveInt('BACKGROUND_TASK_RUN_RETENTION_DAYS', 'Days of cron run history to keep', 30);
const PROVIDER_REQUEST_TIMEOUT_MS = positiveInt('PROVIDER_REQUEST_TIMEOUT_MS', 'Outbound provider HTTP deadline', 15_000);
const DEBUG_MODE = booleanSetting('DEBUG_MODE', 'Emit verbose diagnostics', false);

/**
Every setting, in one place. Drives both parsing and the generated docs.
*/
const SETTING_DESCRIPTORS = [
  MAX_APPLICATIONS_PER_USER,
  MAX_API_KEYS_PER_APPLICATION,
  DEFAULT_API_KEY_EXPIRY_DAYS,
  MAX_API_KEY_EXPIRY_DAYS,
  OAUTH2_STATE_EXPIRY_MINUTES,
  OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS,
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS,
  OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS,
  OAUTH2_TOKEN_REFRESH_BATCH_SIZE,
  BACKGROUND_TASK_RUN_RETENTION_DAYS,
  PROVIDER_REQUEST_TIMEOUT_MS,
  DEBUG_MODE,
] as const;

type SettingKey = (typeof SETTING_DESCRIPTORS)[number]['key'];

/**
Resolved, validated configuration for one request or Worker invocation.
*/
interface AppConfig {
  readonly maxApplicationsPerUser: number;
  readonly maxApiKeysPerApplication: number;
  readonly defaultApiKeyExpiryDays: number;
  readonly maxApiKeyExpiryDays: number;
  readonly oauth2StateExpiryMinutes: number;
  readonly oauth2AccessTokenRefreshWindowSeconds: number;
  readonly oauth2AccessTokenMinValidSeconds: number;
  readonly oauth2AccessTokenFallbackTtlSeconds: number;
  readonly oauth2TokenRefreshBatchSize: number;
  readonly backgroundTaskRunRetentionDays: number;
  readonly providerRequestTimeoutMs: number;
  readonly debugMode: boolean;
}

/**
 * Cross-setting invariants.
 *
 * Checked once at construction so a misconfigured deployment fails at the point
 * of configuration rather than per request, where `DEFAULT > MAX` used to
 * surface as a confusing client-side "requested expiry exceeds maximum".
 */
function validateConfig(config: AppConfig): void {
  if (config.defaultApiKeyExpiryDays > config.maxApiKeyExpiryDays) {
    throw new Error(
      `DEFAULT_API_KEY_EXPIRY_DAYS (${config.defaultApiKeyExpiryDays.toString()}) must not exceed ` +
        `MAX_API_KEY_EXPIRY_DAYS (${config.maxApiKeyExpiryDays.toString()}).`,
    );
  }
  if (config.oauth2AccessTokenRefreshWindowSeconds <= config.oauth2AccessTokenMinValidSeconds) {
    throw new Error(
      `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS (${config.oauth2AccessTokenRefreshWindowSeconds.toString()}) must exceed ` +
        `OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS (${config.oauth2AccessTokenMinValidSeconds.toString()}).`,
    );
  }
}

function readRawEnv(env: unknown, key: string): string | undefined {
  if (!env || typeof env !== 'object') {
    return undefined;
  }
  const value: unknown = (env as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function warnAboutUnrecognizedKeys(env: unknown): void {
  if (!env || typeof env !== 'object') {
    return;
  }
  const known: ReadonlySet<string> = new Set(SETTING_DESCRIPTORS.map((descriptor) => descriptor.key));
  for (const key of Object.keys(env)) {
    // Not an error: env carries bindings, secrets, and DO namespaces too. But a
    // misspelled setting name is otherwise indistinguishable from an unset one,
    // and silently takes the default.
    if (/^[A-Z][A-Z0-9_]*$/.test(key) && !known.has(key) && !KNOWN_NON_SETTING_ENV_KEYS.has(key)) {
      console.warn(`Unrecognized environment variable ${key}; it will be ignored.`);
    }
  }
}

/**
Env keys that are bindings or secrets rather than tunable settings.
*/
const KNOWN_NON_SETTING_ENV_KEYS: ReadonlySet<string> = new Set([
  'DB',
  'AES_ENCRYPTION_KEY_SECRET',
  'OAUTH2_TOKEN_CACHE',
  'CRON_TASKS',
  'OAUTH2_TOKEN_REFRESHERS',
  'TEAM_DOMAIN',
  'POLICY_AUD',
  'DEV_AUTH_EMAIL',
]);

/**
 * Reads and validates configuration from a Workers `env` object.
 *
 * Usage: `AppConfig.fromEnv(env).maxApplicationsPerUser`.
 */
class AppConfigReader {
  private constructor(private readonly config: AppConfig) {}

  public static fromEnv(env: unknown): AppConfigReader {
    warnAboutUnrecognizedKeys(env);
    const resolved: AppConfig = {
      maxApplicationsPerUser: MAX_APPLICATIONS_PER_USER.parse(readRawEnv(env, MAX_APPLICATIONS_PER_USER.key)),
      maxApiKeysPerApplication: MAX_API_KEYS_PER_APPLICATION.parse(readRawEnv(env, MAX_API_KEYS_PER_APPLICATION.key)),
      defaultApiKeyExpiryDays: DEFAULT_API_KEY_EXPIRY_DAYS.parse(readRawEnv(env, DEFAULT_API_KEY_EXPIRY_DAYS.key)),
      maxApiKeyExpiryDays: MAX_API_KEY_EXPIRY_DAYS.parse(readRawEnv(env, MAX_API_KEY_EXPIRY_DAYS.key)),
      oauth2StateExpiryMinutes: OAUTH2_STATE_EXPIRY_MINUTES.parse(readRawEnv(env, OAUTH2_STATE_EXPIRY_MINUTES.key)),
      oauth2AccessTokenRefreshWindowSeconds: OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS.parse(
        readRawEnv(env, OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS.key),
      ),
      oauth2AccessTokenMinValidSeconds: OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS.parse(
        readRawEnv(env, OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS.key),
      ),
      oauth2AccessTokenFallbackTtlSeconds: OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS.parse(
        readRawEnv(env, OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS.key),
      ),
      oauth2TokenRefreshBatchSize: OAUTH2_TOKEN_REFRESH_BATCH_SIZE.parse(readRawEnv(env, OAUTH2_TOKEN_REFRESH_BATCH_SIZE.key)),
      backgroundTaskRunRetentionDays: BACKGROUND_TASK_RUN_RETENTION_DAYS.parse(readRawEnv(env, BACKGROUND_TASK_RUN_RETENTION_DAYS.key)),
      providerRequestTimeoutMs: PROVIDER_REQUEST_TIMEOUT_MS.parse(readRawEnv(env, PROVIDER_REQUEST_TIMEOUT_MS.key)),
      debugMode: DEBUG_MODE.parse(readRawEnv(env, DEBUG_MODE.key)),
    };
    validateConfig(resolved);
    return new AppConfigReader(resolved);
  }

  public get maxApplicationsPerUser(): number {
    return this.config.maxApplicationsPerUser;
  }
  public get maxApiKeysPerApplication(): number {
    return this.config.maxApiKeysPerApplication;
  }
  public get defaultApiKeyExpiryDays(): number {
    return this.config.defaultApiKeyExpiryDays;
  }
  public get maxApiKeyExpiryDays(): number {
    return this.config.maxApiKeyExpiryDays;
  }
  public get oauth2StateExpiryMinutes(): number {
    return this.config.oauth2StateExpiryMinutes;
  }
  public get oauth2AccessTokenRefreshWindowSeconds(): number {
    return this.config.oauth2AccessTokenRefreshWindowSeconds;
  }
  public get oauth2AccessTokenMinValidSeconds(): number {
    return this.config.oauth2AccessTokenMinValidSeconds;
  }
  public get oauth2AccessTokenFallbackTtlSeconds(): number {
    return this.config.oauth2AccessTokenFallbackTtlSeconds;
  }
  public get oauth2TokenRefreshBatchSize(): number {
    return this.config.oauth2TokenRefreshBatchSize;
  }
  public get backgroundTaskRunRetentionDays(): number {
    return this.config.backgroundTaskRunRetentionDays;
  }
  public get providerRequestTimeoutMs(): number {
    return this.config.providerRequestTimeoutMs;
  }
  public get debugMode(): boolean {
    return this.config.debugMode;
  }
}

/**
Human-readable settings reference, generated from the same descriptors.
*/
function describeSettings(): string {
  return SETTING_DESCRIPTORS.map((descriptor) => `  ${descriptor.key.padEnd(46)} ${descriptor.description}`).join('\n');
}

export { AppConfigReader, describeSettings, validateConfig };
export type { AppConfig, SettingDescriptor, SettingKey };
