import { AppConfiguration, EnvParser } from '@rexezuge/runtime';

/**
 * Every setting, in one place.
 *
 * A descriptor table rather than a bag of getters, because the table is also what
 * {@link describeSettings} renders into `docs/DEVELOPMENT.md`-adjacent output and
 * what {@link AppConfigReader.validate} walks to warn about. Previously adding a
 * setting meant editing a defaults file, a manager (twice — once in a namespace
 * object, once as a delegate) and the configuration class, which is how three of
 * the twelve settings ended up with no reader at all.
 */
interface SettingDescriptor {
  /**
  Env var name. Also the key in the docs table.
  */
  key: string;
  /**
  Human-readable purpose, surfaced in warnings and in `describeSettings`.
  */
  description: string;
  /**
  The value used when the var is unset, unparseable, or out of range.
  */
  defaultValue: string;
}

const SETTING_DESCRIPTORS = [
  {
    key: 'MAX_APPLICATIONS_PER_USER',
    description: 'Connected applications a single user may create',
    defaultValue: '99',
  },
  { key: 'MAX_API_KEYS_PER_APPLICATION', description: 'Live API keys per application', defaultValue: '5' },
  { key: 'DEFAULT_API_KEY_EXPIRY_DAYS', description: 'Default API key lifetime in days', defaultValue: '365' },
  { key: 'MAX_API_KEY_EXPIRY_DAYS', description: 'Longest permitted API key lifetime in days', defaultValue: '365' },
  { key: 'OAUTH2_STATE_EXPIRY_MINUTES', description: 'Lifetime of a pending OAuth2 authorization session', defaultValue: '15' },
  {
    key: 'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS',
    description: 'Refresh a token this many seconds before it expires',
    defaultValue: '900',
  },
  {
    key: 'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS',
    description: 'Treat a cached token as unusable below this remaining lifetime',
    defaultValue: '60',
  },
  {
    key: 'OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS',
    description: 'Cache lifetime when the provider omits expires_in',
    defaultValue: '3600',
  },
  { key: 'OAUTH2_TOKEN_REFRESH_BATCH_SIZE', description: 'Applications refreshed per cron tick', defaultValue: '25' },
  { key: 'BACKGROUND_TASK_RUN_RETENTION_DAYS', description: 'Days of cron run history to keep', defaultValue: '30' },
  { key: 'PROVIDER_REQUEST_TIMEOUT_MS', description: 'Outbound provider HTTP deadline', defaultValue: '15000' },
  { key: 'DEBUG_MODE', description: 'Emit verbose diagnostics', defaultValue: 'false' },
] as const satisfies readonly SettingDescriptor[];

/**
 * Env keys that are bindings or secrets rather than tunable settings.
 *
 * Listed because `validate` warns about every unrecognised `SCREAMING_SNAKE`
 * key, and a binding is not a typo. Adding a binding to `wrangler.jsonc`
 * without adding it here produces a startup warning on every cold start.
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
 * Cross-setting invariants.
 *
 * Returned as warnings rather than thrown. Both of these were previously thrown,
 * and a throw in `fromEnv` took down *every* request in the deployment — a
 * configuration mistake surfaced as a 500 storm rather than as a startup log
 * line, which is the harder of the two to diagnose. The checks are real: a
 * deployment that sets `DEFAULT_API_KEY_EXPIRY_DAYS=90` and
 * `MAX_API_KEY_EXPIRY_DAYS=30` is broken, and the operator should be told.
 */
function crossSettingWarnings(env: unknown): string[] {
  const warnings: string[] = [];
  const defaultExpiry = EnvParser.positiveInt(env, 'DEFAULT_API_KEY_EXPIRY_DAYS', '365');
  const maxExpiry = EnvParser.positiveInt(env, 'MAX_API_KEY_EXPIRY_DAYS', '365');
  if (defaultExpiry > maxExpiry) {
    warnings.push(
      `DEFAULT_API_KEY_EXPIRY_DAYS (${defaultExpiry.toString()}) exceeds MAX_API_KEY_EXPIRY_DAYS (${maxExpiry.toString()}); ` +
        'every issued key will be rejected as too long.',
    );
  }
  const refreshWindow = EnvParser.positiveInt(env, 'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS', '900');
  const minValid = EnvParser.positiveInt(env, 'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS', '60');
  if (refreshWindow <= minValid) {
    warnings.push(
      `OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS (${refreshWindow.toString()}) does not exceed ` +
        `OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS (${minValid.toString()}); every token will be discarded as unusable before it is due.`,
    );
  }
  return warnings;
}

/**
 * The two parsers, bound to their class.
 *
 * `EnvParser`'s readers call `this.readString`, so a bare method reference loses
 * the receiver and throws `Cannot read properties of undefined`. Passing
 * `EnvParser.positiveInt` straight into {@link AppConfigReader.setting} compiles,
 * typechecks and fails on the first getter read — which is why the alias exists.
 */
const readPositiveInt = (env: unknown, key: string, fallback: string): number => EnvParser.positiveInt(env, key, fallback);
const readBoolean = (env: unknown, key: string, fallback: string): boolean => EnvParser.boolean(env, key, fallback);

/**
 * Mail-Meow's resolved, validated configuration.
 *
 * The kit's `AppConfiguration` is a thin base — `SITE_URL`, `ENVIRONMENT`, and
 * a `validate()` that checks for a dev bypass left on in production. The settings
 * are the subclass's own, because which knobs exist is per-project by nature;
 * the kit says as much in its own header. What converges here is the *parsing*
 * (`EnvParser`) and the warning discipline, so a misspelled setting is reported
 * the same way in all nine repos.
 *
 * Reads are lazy. The previous implementation parsed all twelve values in
 * `fromEnv`, which meant `GET /user/me` — which reads one — parsed eleven it
 * would never look at. The getters below resolve on access and memoize.
 */
class AppConfigReader extends AppConfiguration {
  private readonly cache = new Map<string, string | number | boolean>();

  /**
   * `protected`, not `private`, and that is not a loosening: the base's static
   * `fromEnv` is typed `(this: new (env: unknown) => T) => T`, so a *private*
   * constructor here makes `AppConfigReader.fromEnv(...)` fail to compile at every
   * call site — `typeof AppConfigReader` would not satisfy its own `this` type.
   * Nobody can still `new AppConfigReader(env)` from outside, because `protected`
   * is what the base declares too.
   */
  constructor(env: unknown) {
    super(env);
  }

  /**
   * Read a setting, parsing it once per instance.
   *
   * `EnvParser` answers the default for an unparseable value, but a bad value
   * should still be *reported* — hence the second pass in {@link validate}.
   * Silently substituting the default here and warning only at startup is the
   * intended split: a warning nobody reads beats a request that fails.
   */
  private setting<T extends string | number | boolean>(
    key: string,
    defaultValue: string,
    parse: (env: unknown, key: string, fallback: string) => T,
  ): T {
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit as T;
    const value = parse(this.raw(), key, defaultValue);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Startup warnings: the kit's family-wide checks, this repo's cross-setting
   * invariants, and unrecognised vars.
   */
  public override validate(): string[] {
    const warnings: string[] = [...super.validate(), ...crossSettingWarnings(this.raw())];

    for (const descriptor of SETTING_DESCRIPTORS) {
      const raw = EnvParser.readString(this.raw(), descriptor.key);
      if (raw === undefined || descriptor.defaultValue === 'false') continue;
      if (!EnvParser.isValidPositiveInt(this.raw(), descriptor.key)) {
        warnings.push(`${descriptor.key}="${raw}" is not a positive integer; falling back to ${descriptor.defaultValue}.`);
      }
    }

    const known: ReadonlySet<string> = new Set(SETTING_DESCRIPTORS.map((descriptor) => descriptor.key));
    // Narrowed once, here, rather than three times in the loop condition below:
    // `raw()` is `unknown` by design — the kit takes whatever the platform
    // produced — so the question "is this an object?" has to be answered once.
    const env: Record<string, unknown> =
      typeof this.raw() === 'object' && this.raw() !== null ? (this.raw() as Record<string, unknown>) : {};
    for (const key of Object.keys(env)) {
      // Not an error: env carries bindings, secrets, and DO namespaces too. But
      // a misspelled setting name is otherwise indistinguishable from an unset
      // one, and silently takes the default.
      if (/^[A-Z][A-Z0-9_]*$/.test(key) && !known.has(key) && !KNOWN_NON_SETTING_ENV_KEYS.has(key)) {
        warnings.push(`Unrecognized environment variable ${key}; it will be ignored.`);
      }
    }

    return warnings;
  }

  public get maxApplicationsPerUser(): number {
    return this.setting('MAX_APPLICATIONS_PER_USER', '99', readPositiveInt);
  }
  public get maxApiKeysPerApplication(): number {
    return this.setting('MAX_API_KEYS_PER_APPLICATION', '5', readPositiveInt);
  }
  public get defaultApiKeyExpiryDays(): number {
    return this.setting('DEFAULT_API_KEY_EXPIRY_DAYS', '365', readPositiveInt);
  }
  public get maxApiKeyExpiryDays(): number {
    return this.setting('MAX_API_KEY_EXPIRY_DAYS', '365', readPositiveInt);
  }
  public get oauth2StateExpiryMinutes(): number {
    return this.setting('OAUTH2_STATE_EXPIRY_MINUTES', '15', readPositiveInt);
  }
  public get oauth2AccessTokenRefreshWindowSeconds(): number {
    return this.setting('OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS', '900', readPositiveInt);
  }
  public get oauth2AccessTokenMinValidSeconds(): number {
    return this.setting('OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS', '60', readPositiveInt);
  }
  public get oauth2AccessTokenFallbackTtlSeconds(): number {
    return this.setting('OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS', '3600', readPositiveInt);
  }
  public get oauth2TokenRefreshBatchSize(): number {
    return this.setting('OAUTH2_TOKEN_REFRESH_BATCH_SIZE', '25', readPositiveInt);
  }
  public get backgroundTaskRunRetentionDays(): number {
    return this.setting('BACKGROUND_TASK_RUN_RETENTION_DAYS', '30', readPositiveInt);
  }
  public get providerRequestTimeoutMs(): number {
    return this.setting('PROVIDER_REQUEST_TIMEOUT_MS', '15000', readPositiveInt);
  }
  /**
   * `DEBUG_MODE` is the one boolean, and it is parsed with the same
   * truthiness rule as every other setting in the family: exactly `'true'`
   * enables it. `yes`/`1`/`on` used to enable it too, and so did a *typo* —
   * `'True'`, `'true '` — which is the wrong direction for a diagnostics flag.
   */
  public get debugMode(): boolean {
    return this.setting('DEBUG_MODE', 'false', readBoolean);
  }
}

/**
 * Human-readable settings reference, generated from the same descriptors the
 * reader parses.
 */
function describeSettings(): string {
  return SETTING_DESCRIPTORS.map((descriptor) => `  ${descriptor.key.padEnd(46)} ${descriptor.description}`).join('\n');
}

export { AppConfigReader, describeSettings };
export type { SettingDescriptor };
