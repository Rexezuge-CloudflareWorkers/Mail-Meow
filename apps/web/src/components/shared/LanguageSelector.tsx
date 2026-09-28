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

interface LanguageSelectorProps {
  value?: string;
  onChange: (lng: string) => void;
  disabled?: boolean;
  /**
  Accessible name for the control. The caller owns the visible label.
  */
  label?: string;
}

/**
 * Native-language `<select>`.
 *
 * The control carries its own `aria-label` and renders no wrapping `<label>`:
 * the caller supplies the visible label as a sibling. Wrapping a `<select>` that
 * already has an accessible name in a `<label>` produced nested labels, and the
 * `sr-only` span plus `aria-label` gave it the same name twice.
 */
export function LanguageSelector({ value, onChange, disabled, label }: LanguageSelectorProps) {
  const { t, i18n } = useTranslation();
  const accessibleName = label ?? t('header.selectLanguage', 'Select Language');
  const isUnknown = value === 'unknown';

  return (
    <select
      aria-label={accessibleName}
      value={isUnknown ? 'unknown' : normalizeLanguage(value ?? i18n.resolvedLanguage ?? i18n.language)}
      disabled={disabled || isUnknown}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#1a1f29] border border-[#2d3745] rounded px-2 py-1 text-sm disabled:opacity-60"
    >
      {isUnknown ? (
        <option value="unknown">{t('header.unknownLanguage', 'Unknown')}</option>
      ) : (
        SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng}>
            {NATIVE_NAMES[lng] ?? lng}
          </option>
        ))
      )}
    </select>
  );
}
