# Mail-Meow — shared

Scope: `packages/shared/**`. Parent index: `../../AGENTS.md`.

See root `AGENTS.md` Index and `docs/agents/runtime/AGENTS.md` for layer rules. Layer 0: zero `@mail-meow/*` deps.

`utils/` is down to `ApiKeyUtil` and `BaseUrlUtil` — the two things that are genuinely this app's. `CryptoUtil`, `TimestampUtil`, `UUIDUtil`, `ErrorSanitizationUtil`, `LocaleUtil` and `normalizeEmail` are `@rexezuge/shared`'s and are imported from there directly rather than re-exported: a re-export would recreate the second name for one implementation that the convergence exists to remove.
