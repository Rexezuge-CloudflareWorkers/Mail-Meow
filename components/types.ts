export type ProviderId = 'google-gmail' | 'microsoft-outlook' | 'amazon-sns';
export type ConnectionMethod = 'oauth2' | 'access-keys';
export type ApplicationStatus = 'draft' | 'connected';

export interface ConnectedApplication {
  applicationId: string;
  userEmail: string;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: ConnectionMethod;
  status: ApplicationStatus;
  createdAt: number;
  updatedAt: number;
  oauth2RedirectUri: string;
}

export interface ApplicationApiKey {
  apiKeyId: string;
  applicationId: string;
  name: string;
  keyPrefix: string;
  keyLastFour: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
}

export interface CurrentUser {
  email: string;
  limits: {
    maxApplicationsPerUser: number;
    maxApiKeysPerApplication: number;
    defaultApiKeyExpiryDays: number;
    maxApiKeyExpiryDays: number;
  };
}
