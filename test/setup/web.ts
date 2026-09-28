import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../apps/web/src/locales/en/translation.json';

// Every component renders through `useTranslation`, and without an initialized
// instance `t` returns undefined, so components render empty and every query
// fails. Initializing once here keeps each test focused on behaviour.
beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

// React Testing Library does not auto-clean under Vitest's globals mode, which
// would leave mounted trees between tests and make queries match stale nodes.
afterEach(() => {
  cleanup();
});
