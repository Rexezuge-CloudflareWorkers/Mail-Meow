# Mail-Meow — Web SPA

Scope: `apps/web/**`. Parent index: `../../AGENTS.md`.

Vite React SPA served at `/user`. Components under `src/components/`: `layout/` (`SpaViewRouter.tsx` owns the view switch), `views/` (`MailboxesView`, `ProcessingView`, `HelpView` + Otter-parity stubs), `mailboxes/` (`ApplicationForm.tsx`, `RulesSection.tsx` facade), `shared/` (`Header`, `Notice`, `StatusBadge`, `Unauthorized`), `ui/`. Hooks: `useMailboxes.ts` delegates to `useApplications.ts` + `useIntegrations.ts` slices (return shape stable); `useSpaLanguage.ts` owns SPA language state (`SpaApp.tsx` stays a thin shell composing hooks + `SpaViewRouter`). `src/adapters/mailboxAdapter.ts` maps `ConnectedApplication ↔ Mailbox` (`toMailbox`/`fromMailbox`). Locale-aware `lib/format.ts` + `lib/locale.ts`; `LanguageSelector` in `Header`.

## Frontend Internationalization

SPA UI strings live in `src/locales/<tag>/translation.json` (12 locales: `en`, `de`, `fr`, `es`, `it`, `nl`, `pt`, `pl`, `ja`, `zh-CN`, `zh-TW`, `ko`) consumed via `useTranslation()` (`t('ns.key', 'English Default')` — always pass the English default so missing keys still render). Rules for new UI text:

- Add the key + English default to `en/translation.json` first, then mirror it into the other 11 locale files (same key order). Validate with `scripts/validate_locales.py` (JSON-valid, key parity incl. no extra keys, `{{placeholder}}` parity, no empty values).
- Lazy loading: `src/i18n.ts` code-splits per-locale chunks (`loadLanguage`, `import.meta.glob`); never statically import a non-English locale (only `en` is static; breaks code-splitting).
- Detection precedence: backend `preferredLanguage` (`GET /user/me`) > `localStorage('mail-meow-lng')` > `navigator.language` > `en`. `SpaApp` applies it and keeps `<html lang>` in sync.
- Dates/numbers: `lib/format.ts` helpers take optional `lng` (pass `i18n.resolvedLanguage`); ad-hoc `toLocale*()` must pass an explicit locale, never rely on the ambient default.
- Backend user text uses `getBackendStrings(locale)` from `@mail-meow/shared/i18n`. API error `Message` strings stay English (stable `Type` codes); translate display-side only.

## Web UI Text Conventions

**English-source** user-visible text in `apps/web/` must use **Title Case**. Applies to: button labels, headings, card titles, section headers, form labels, placeholders, empty-state messages, toasts, confirm dialogs, `aria-label`, `<option>` text. Translations use each language's natural casing (Title Case is English-only).

**Never hardcode ALL CAPS in JSX.** Use CSS (`uppercase` Tailwind / `text-transform: uppercase`) instead.
