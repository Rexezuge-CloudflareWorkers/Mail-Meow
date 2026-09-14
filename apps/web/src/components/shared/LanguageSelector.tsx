import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, normalizeLanguage } from '../../i18n';

const NATIVE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
  pt: 'Português',
  pl: 'Polski',
  ja: '日本語',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ko: '한국어',
};

export function LanguageSelector({
  value,
  onChange,
  disabled,
}: {
  value?: string;
  onChange: (lng: string) => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const unknownLabel = t('header.unknownLanguage', 'Unknown');
  if (value === 'unknown') {
    return (
      <label className="flex items-center gap-2 text-sm text-[#aab4c2]">
        <span className="sr-only">{t('header.selectLanguage', 'Select Language')}</span>
        <select
          aria-label={t('header.selectLanguage', 'Select Language')}
          value="unknown"
          disabled
          onChange={(e) => onChange(e.target.value)}
          className="bg-[#1a1f29] border border-[#2d3745] rounded px-2 py-1 text-sm disabled:opacity-60"
        >
          <option value="unknown">{unknownLabel}</option>
        </select>
      </label>
    );
  }
  const current = normalizeLanguage(value ?? i18n.resolvedLanguage ?? i18n.language);
  return (
    <label className="flex items-center gap-2 text-sm text-[#aab4c2]">
      <span className="sr-only">{t('header.selectLanguage', 'Select Language')}</span>
      <select
        aria-label={t('header.selectLanguage', 'Select Language')}
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#1a1f29] border border-[#2d3745] rounded px-2 py-1 text-sm disabled:opacity-60"
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng}>
            {NATIVE_NAMES[lng] ?? lng}
          </option>
        ))}
      </select>
    </label>
  );
}
