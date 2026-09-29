import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatExpiryTimestamp, formatTimestamp } from '~/lib/format';
import { resolveLocale } from '~/lib/locale';
import { methodLabels, providerLabels, providerMethod } from '~/lib/providers';
import { cn } from '~/lib/utils';
import { SUPPORTED_LANGUAGES, normalizeLanguage } from '~/i18n';

// Fixed clock so the relative-time assertions are exact rather than dependent on
// which side of a minute boundary the test happens to run.
const FIXED_NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const NOW_SECONDS = Math.floor(FIXED_NOW / 1000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatTimestamp', () => {
  it('reports never for an absent timestamp', () => {
    expect(formatTimestamp(null)).toBe('Never');
    expect(formatTimestamp(undefined)).toBe('Never');
  });

  it('reports a relative age for a recent timestamp', () => {
    expect(formatTimestamp(NOW_SECONDS - 30)).toBe('Just now');
    expect(formatTimestamp(NOW_SECONDS - 5 * 60)).toBe('5m ago');
    expect(formatTimestamp(NOW_SECONDS - 3 * 3600)).toBe('3h ago');
    expect(formatTimestamp(NOW_SECONDS - 2 * 86_400)).toBe('2d ago');
  });

  it('falls back to a date beyond a week', () => {
    const old = NOW_SECONDS - 30 * 86_400;
    // Beyond a week the relative form stops being useful, so a date is shown.
    expect(formatTimestamp(old, 'en')).toMatch(/\d/);
    expect(formatTimestamp(old, 'en')).not.toContain('ago');
  });

  it('honours the requested locale for the date fallback', () => {
    const old = NOW_SECONDS - 30 * 86_400;
    expect(formatTimestamp(old, 'de')).not.toBe(formatTimestamp(old, 'en'));
  });
});

describe('formatExpiryTimestamp', () => {
  it('reports never for an absent expiry', () => {
    expect(formatExpiryTimestamp(null)).toBe('Never');
  });

  it('reports an imminent expiry', () => {
    expect(formatExpiryTimestamp(NOW_SECONDS + 30)).toBe('Expires soon');
  });

  it('reports a relative remaining lifetime', () => {
    expect(formatExpiryTimestamp(NOW_SECONDS + 10 * 60)).toBe('Expires in 10m');
    expect(formatExpiryTimestamp(NOW_SECONDS + 5 * 3600)).toBe('Expires in 5h');
    expect(formatExpiryTimestamp(NOW_SECONDS + 3 * 86_400)).toBe('Expires in 3d');
  });

  it('falls back to a date for a far-off expiry', () => {
    const far = NOW_SECONDS + 90 * 86_400;
    expect(formatExpiryTimestamp(far, 'en')).toContain('Expires');
    expect(formatExpiryTimestamp(far, 'en')).not.toContain('Expires in');
  });
});

describe('resolveLocale', () => {
  it('passes a supported tag through', () => {
    expect(resolveLocale('pt')).toBe('pt');
  });

  it('falls back to English for an unsupported or absent tag', () => {
    expect(resolveLocale('xx')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('i18n language helpers', () => {
  it('normalizes a regional tag to a supported language', () => {
    expect(normalizeLanguage('de-DE')).toBe('de');
    expect(normalizeLanguage('pt-BR')).toBe('pt');
  });

  it('maps a script-qualified Chinese tag to the right script', () => {
    // Regression: the script subtag was discarded before the base-language
    // fallback, so Traditional tags resolved to simplified zh-CN.
    expect(normalizeLanguage('zh-Hans-CN')).toBe('zh-CN');
    expect(normalizeLanguage('zh-Hant-TW')).toBe('zh-TW');
  });

  it('maps a Traditional Chinese region to Traditional', () => {
    expect(normalizeLanguage('zh-HK')).toBe('zh-TW');
    expect(normalizeLanguage('zh-MO')).toBe('zh-TW');
  });

  it('maps a bare or Simplified Chinese tag to Simplified', () => {
    expect(normalizeLanguage('zh')).toBe('zh-CN');
    expect(normalizeLanguage('zh-SG')).toBe('zh-CN');
  });

  it('falls back to English for an unsupported tag', () => {
    expect(normalizeLanguage('xx-YY')).toBe('en');
  });

  it('supports every locale the selector offers', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(1);
    for (const language of SUPPORTED_LANGUAGES) {
      expect(normalizeLanguage(language)).toBe(language);
    }
  });
});

describe('provider label tables', () => {
  it('names every provider the app supports', () => {
    expect(providerLabels['google-gmail']).toBe('Google Gmail');
    expect(providerLabels['microsoft-outlook']).toBe('Microsoft Outlook');
    expect(providerLabels['amazon-sns']).toBe('Amazon SNS');
  });

  it('names every connection method', () => {
    expect(methodLabels.oauth2).toBe('OAuth2');
    expect(methodLabels['access-keys']).toBe('Access keys');
  });

  it('maps each provider to exactly one connection method', () => {
    // Two providers per method, one that differs; the form and the backend both
    // branch on this, so a gap would silently mislabel a credential set.
    expect(Object.keys(providerMethod).sort()).toEqual(Object.keys(providerLabels).sort());
    expect(providerMethod['amazon-sns']).toBe('access-keys');
    expect(providerMethod['google-gmail']).toBe('oauth2');
  });
});

describe('cn', () => {
  // `cn` currently has no production call site — the components use literal
  // Tailwind strings — but it is a real, working helper rather than dead code,
  // and these cases pin the falsy-dropping behaviour it exists to provide. Kept
  // deliberately: deleting it would mean re-deriving conditional class merging
  // the first time a component needs it.
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('');
  });
});
