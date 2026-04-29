import type { ConnectionMethod, ProviderId } from './types';

export const providerLabels: Record<ProviderId, string> = {
  'google-gmail': 'Google Gmail',
  'microsoft-outlook': 'Microsoft Outlook',
  'amazon-sns': 'Amazon SNS',
};

export const methodLabels: Record<ConnectionMethod, string> = {
  oauth2: 'OAuth2',
  'access-keys': 'Access keys',
};

export const providerMethod: Record<ProviderId, ConnectionMethod> = {
  'google-gmail': 'oauth2',
  'microsoft-outlook': 'oauth2',
  'amazon-sns': 'access-keys',
};

export function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000));
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data.Exception?.Message || data.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}
