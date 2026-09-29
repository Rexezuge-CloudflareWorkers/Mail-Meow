import { normalizeLanguage } from '../i18n';

export function resolveLocale(lng?: string | null): string {
  if (lng) return normalizeLanguage(lng);
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('mail-meow-lng');
    if (stored) return normalizeLanguage(stored);
  } catch {
    // Ignore storage errors.
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language) return normalizeLanguage(navigator.language);
  } catch {
    // Ignore and fall through.
  }
  return 'en';
}
