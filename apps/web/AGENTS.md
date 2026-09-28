# Mail-Meow — Web SPA

Scope: `apps/web/**`. Parent index: `../../AGENTS.md`.

Vite React SPA served at `/user`.

## Layout

- `src/SpaApp.tsx` — composition shell. Owns the view state and composes hooks;
  `components/layout/SpaViewRouter.tsx` performs the view switch.
- `src/components/views/` — `MailboxesView`, `ProcessingView`, `HelpView`.
- `src/components/mailboxes/` — `ApplicationForm`.
- `src/components/shared/` — `Header`, `Notice`, `LanguageSelector`, `StatusBadge`,
  `Unauthorized`.
- `src/hooks/` — `useAsyncResource` (shared async lifecycle), `useApplications`,
  `useApiKeys`, `useCurrentUser`, `useProcessing`, `useNotice`, `useSpaLanguage`.
- `src/lib/` — `api.ts` (fetch + D1 bookmark), `format.ts`, `locale.ts`, `providers.ts`,
  `constants.ts`, `utils.ts`.
- `src/i18n.ts` — language detection, normalization, and lazy locale loading.

## Async Data

Use `useAsyncResource` for any loader. It records the error instead of letting it escape, so
a new hook cannot forget the failure branch, and callers get `error` instead of guessing.

This exists because three call sites each got it wrong: `useProcessing` swallowed its failure
with `.catch(() => undefined)`, so a stopped cron rendered "no task runs yet" — identical to
an empty history — and `SpaApp` treated a transient application-list failure as an
authentication failure, bouncing an already-admitted user to the Unauthorized screen.

**A loader must reject on failure, never resolve to an empty list.** An empty list and a
failed fetch are different states and the UI has to be able to tell them apart.

## Frontend Internationalization

SPA UI strings live in `src/locales/<tag>/translation.json` (12 locales: `en`, `de`, `fr`,
`es`, `it`, `nl`, `pt`, `pl`, `ja`, `zh-CN`, `zh-TW`, `ko`) consumed via `useTranslation()`
(`t('ns.key', 'English Default')` — always pass the English default so a missing key still
renders).

- Add the key + English default to `en/translation.json` first, then mirror it into the other
  11 files in the same key order. Validate with `apps/web/scripts/validate_locales.py`, which
  runs in CI and checks **both** parity and usage. The usage check is what catches a key the code
  calls but no locale defines — such a key does not fail anything, it silently renders the
  English default in every language. If you build a key name from a template literal, add it to
  the script's `DYNAMIC_KEYS` allow-list or it will report a false failure.
- Lazy loading: `src/i18n.ts` code-splits per-locale chunks; never statically import a
  non-English locale (only `en` is static — importing another breaks code-splitting).
- Detection precedence: backend `preferredLanguage` > `localStorage('mail-meow-lng')` >
  `navigator.language` > `en`. `SpaApp` applies it and keeps `<html lang>` in sync.
- **Script subtags matter.** `normalizeLanguage` reads the script and region before falling
  back to the base language, because both Chinese variants ship and they are not
  interchangeable. Note the region search must skip index 0: `zh` is itself two letters, and
  matching it as the region silently routed every Traditional tag to `zh-CN`.
- Dates/numbers: `lib/format.ts` helpers take an optional `lng`; ad-hoc `toLocale*()` must
  pass an explicit locale, never rely on the ambient default.
- API error `Message` strings stay English (the `Type` code is the stable contract);
  translate display-side only. There is no backend string catalogue.

## Web UI Text Conventions

**English-source** user-visible text in `apps/web/` must use **Title Case**: button labels,
headings, card titles, section headers, form labels, placeholders, empty-state messages,
toasts, confirm dialogs, `aria-label`, `<option>` text. Translations use each language's
natural casing; Title Case is English-only.

**Never hardcode ALL CAPS in JSX.** Use CSS (`uppercase` Tailwind) instead.

## Accessibility

Not optional — regressions here are invisible in review and untestable without the jsdom
project.

- Transient messages need `role="alert"` (errors) or `role="status"` (successes) plus
  `aria-live`. A plain `div` is announced by nothing.
- Do not wrap a control in a `<label>` if the control already has an `aria-label`; that is
  nested labels. `LanguageSelector` takes its accessible name as a prop and `Header` renders
  the visible label as a sibling.
- Every input needs a real `<label>` or `aria-label` — a placeholder is not one.
- Tables need `<caption>` (or `aria-label`) and `scope="col"` on every `<th>`.
- Selection and current state must not be conveyed by colour alone: use `aria-current`,
  `aria-pressed`, or `aria-expanded`.
- Anything that hides content on small screens needs a control that reveals it.
- Destructive actions ask for confirmation.
- Loading regions carry `aria-busy` and a text alternative, not just a spinner.

## Testing

`vitest.config.mts` defines a `web` project (jsdom + React Testing Library) for
`test/web/**/*.test.{ts,tsx}`. See `docs/agents/testing/AGENTS.md`. Import app code through
the `~` alias.
