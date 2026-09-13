import { apiGet, apiPut } from '../lib/api';
import type { CurrentUser } from '../types';

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>('/user/me');
}

export async function updatePreferredLanguage(preferredLanguage: string): Promise<CurrentUser> {
  return apiPut<CurrentUser>('/user/me', { preferredLanguage });
}
