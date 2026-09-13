import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import type { ApplicationApiKey, ConnectedApplication } from '../types';

export async function listApplications(): Promise<{ applications: ConnectedApplication[] }> {
  return apiGet<{ applications: ConnectedApplication[] }>('/user/applications');
}

export async function createApplication(payload: Record<string, unknown>): Promise<{ application: ConnectedApplication }> {
  return apiPost<{ application: ConnectedApplication }>('/user/application', payload);
}

export async function updateApplication(payload: Record<string, unknown>): Promise<{ application: ConnectedApplication }> {
  return apiPut<{ application: ConnectedApplication }>('/user/application', payload);
}

export async function deleteApplication(applicationId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>('/user/application', { applicationId });
}

export async function createOAuth2Authorization(applicationId: string): Promise<{ authorizationUrl: string }> {
  return apiPost<{ authorizationUrl: string }>('/user/application/oauth2/authorize', { applicationId });
}

export async function listApiKeys(applicationId: string): Promise<{ apiKeys: ApplicationApiKey[] }> {
  return apiGet<{ apiKeys: ApplicationApiKey[] }>('/user/application/api-keys', { applicationId });
}

export async function createApiKey(applicationId: string, name: string, expiresInDays?: number): Promise<{ apiKey: string; metadata: ApplicationApiKey }> {
  return apiPost<{ apiKey: string; metadata: ApplicationApiKey }>('/user/application/api-key', { applicationId, name, expiresInDays });
}

export async function deleteApiKey(applicationId: string, apiKeyId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>('/user/application/api-key', { applicationId, apiKeyId });
}
