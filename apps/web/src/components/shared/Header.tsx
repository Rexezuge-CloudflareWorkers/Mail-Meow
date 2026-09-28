import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CurrentUser, SpaView } from '../../types';
import { LanguageSelector } from './LanguageSelector';

const VIEWS: SpaView[] = ['mailboxes', 'processing', 'help'];

interface HeaderProps {
  user: CurrentUser;
  view: SpaView;
  onViewChange: (view: SpaView) => void;
  language: string;
  onLanguageChange: (lng: string) => void;
  languageDisabled?: boolean;
}

export default function Header({ user, view, onViewChange, language, onLanguageChange, languageDisabled }: HeaderProps) {
  const { t } = useTranslation();
  const [navOpen, setNavOpen] = useState(false);

  const navClassName = navOpen ? 'flex' : 'hidden md:flex';

  return (
    <header className="sticky top-0 z-40 border-b border-[#252b36] bg-[#101319]/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-xl font-semibold">
            <span className="text-[#6ee7b7]">Mail</span>-Meow
          </div>
          {/* The nav was `hidden md:flex` with no small-screen fallback, which left
              the SPA unusable below the md breakpoint. */}
          <button
            type="button"
            onClick={() => setNavOpen((open) => !open)}
            aria-expanded={navOpen}
            aria-controls="primary-nav"
            className="md:hidden text-sm text-[#aab4c2] rounded px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6ee7b7]"
          >
            {t('header.menu', 'Menu')}
          </button>
          <nav id="primary-nav" className={`${navClassName} items-center rounded-md bg-[#1a1f29] p-1 text-sm text-[#aab4c2]`}>
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  onViewChange(v);
                  setNavOpen(false);
                }}
                // Selection was conveyed by background colour alone.
                aria-current={view === v ? 'page' : undefined}
                className={`px-3 py-1 rounded ${view === v ? 'bg-[#2d3745] text-white' : ''}`}
              >
                {t(`nav.${v}`, v)}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {/* A sibling <span> + the control's own aria-label, rather than a
              wrapping <label> around a select that already had an accessible name. */}
          <span className="text-sm text-[#aab4c2]">{t('header.language', 'Language')}</span>
          <LanguageSelector
            value={language}
            onChange={onLanguageChange}
            disabled={languageDisabled}
            label={t('header.selectLanguage', 'Select Language')}
          />
          <div className="text-sm text-[#aab4c2] truncate">{user.email}</div>
        </div>
      </div>
    </header>
  );
}
