export type ProviderId = 'google-gmail' | 'microsoft-outlook' | 'amazon-sns';

export interface CurrentUser {
  email: string;
  preferredLanguage?: string | null;
  limits: {
    maxApplicationsPerUser: number;
    maxApiKeysPerApplication: number;
    defaultApiKeyExpiryDays: number;
    maxApiKeyExpiryDays: number;
  };
}

export interface ConnectedApplication {
  applicationId: string;
  userEmail: string;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: 'oauth2' | 'access-keys';
  status: 'draft' | 'connected';
  oauth2RedirectUri?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApplicationApiKey {
  apiKeyId: string;
  applicationId: string;
  name: string;
  keyPrefix: string;
  keyLastFour: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number | null;
}

export interface BackgroundTaskRun {
  runId: string;
  taskType: string;
  applicationId: string | null;
  status: string;
  itemsProcessed: number;
  itemsFailed: number;
  summary: string | null;
  startedAt: number;
  completedAt: number | null;
}

export type SpaView = 'mailboxes' | 'processing' | 'help';
