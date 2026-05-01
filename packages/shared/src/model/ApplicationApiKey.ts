interface ApplicationApiKeyMetadata {
  apiKeyId: string;
  applicationId: string;
  name: string;
  keyPrefix: string;
  keyLastFour: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number | undefined;
}

interface ApplicationApiKey extends ApplicationApiKeyMetadata {
  apiKey: string;
}

interface ApplicationApiKeyInternal {
  api_key_id: string;
  application_id: string;
  key_hash: string;
  name: string;
  key_prefix: string;
  key_last_four: string;
  created_at: number;
  expires_at: number;
  last_used_at?: number | undefined;
}

export type { ApplicationApiKey, ApplicationApiKeyInternal, ApplicationApiKeyMetadata };
