interface SecretsStoreSecret {
  get(): Promise<string>;
}

interface Env {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  MAX_APPLICATIONS_PER_USER?: string;
  MAX_API_KEYS_PER_APPLICATION?: string;
  DEFAULT_API_KEY_EXPIRY_DAYS?: string;
  MAX_API_KEY_EXPIRY_DAYS?: string;
  OAUTH2_STATE_EXPIRY_MINUTES?: string;
  DEV_AUTH_EMAIL?: string;
}
