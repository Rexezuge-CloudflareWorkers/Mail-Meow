import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import type { CurrentUser, SpaView } from '../../types';

interface HeaderProps {
  user: CurrentUser;
  view: SpaView;
  onViewChange: (view: SpaView) => void;
  language: string;
  onLanguageChange: (lng: string) => void;
}

export default function Header({ user, view, onViewChange, language, onLanguageChange }: HeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-b border-[#252b36] bg-[#101319]/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-xl font-semibold">
            <span className="text-[#6ee7b7]">Mail</span>-Meow
          </div>
          <nav className="hidden md:flex items-center rounded-md bg-[#1a1f29] p-1 text-sm text-[#aab4c2]">
            {(['mailboxes', 'processing', 'help'] as SpaView[]).map((v) => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={`px-3 py-1 rounded ${view === v ? 'bg-[#2d3745] text-white' : ''}`}
              >
                {t(`nav.${v}`, v)}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-[#aab4c2]">
            {t('header.language', 'Language')}{' '}
            <select value={language} onChange={(e) => onLanguageChange(e.target.value)} className="bg-[#1a1f29] border border-[#2d3745] rounded px-2 py-1">
              {SUPPORTED_LANGUAGES.map((lng) => (
                <option key={lng} value={lng}>
                  {lng}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm text-[#aab4c2] truncate">{user.email}</div>
        </div>
      </div>
    </header>
  );
}
