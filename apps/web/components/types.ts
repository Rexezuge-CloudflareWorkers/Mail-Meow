export type ProviderId = 'google-gmail' | 'microsoft-outlook' | 'amazon-sns';

export interface CurrentUser {
  email: string;
  limits: {
    maxApplicationsPerUser: number;
    maxApiKeysPerApplication: number;
    defaultApiKeyExpiryDays: number;
  };
}

export interface ConnectedApplication {
  applicationId: string;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: 'oauth2' | 'access-keys';
  status: 'draft' | 'connected';
  oauth2RedirectUri?: string;
  updatedAt: number;
}

export interface ApplicationApiKey {
  apiKeyId: string;
  name: string;
  keyPrefix: string;
  keyLastFour: string;
  expiresAt: number;
  lastUsedAt?: number | null;
}
