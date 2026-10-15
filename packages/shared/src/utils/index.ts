/**
 * The utils that stayed.
 *
 * The rest of this directory was five near-copies of what `@rexezuge/shared`
 * already ships — `CryptoUtil`, `TimestampUtil`, `UUIDUtil`,
 * `ErrorSanitizationUtil` and `LocaleUtil` — plus an `EmailUtil` whose only
 * export, `normalizeEmail`, is the kit's verbatim. Nine repos each carried
 * their own, and the copies had already drifted (this repo's `normalize` sent
 * every `zh*` to `zh-CN`, including `zh-TW`, which is a different language).
 *
 * What remains is what is genuinely this app's: an API-key envelope, and the
 * request-origin helper.
 *
 * The kit is imported directly rather than re-exported from here. A re-export
 * would recreate the one problem this barrel was supposed to solve — a second
 * name for a symbol with one implementation, which is how the drift started.
 */
export * from './ApiKeyUtil';
export * from './BaseUrlUtil';
