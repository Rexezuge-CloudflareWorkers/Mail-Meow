# Mail-Meow — Provider Clients

Scope: `packages/provider-clients/**`. Parent index: `../../AGENTS.md`.

Layer 2. Depends only on `@mail-meow/shared` and `@rexezuge/{errors,shared}`. No
`@mail-meow/backend-data` (no DAOs), no `backend-runtime`, no `backend-services`, no `apps/*`
(enforced by `no-restricted-imports`).

## Layout

- `http/HttpClient.ts` — `IHttpClient` interface + `FetchHttpClient`. The single outbound HTTP
  seam. Inject it rather than calling `fetch` directly so tests can substitute a client.
- `BaseProviderHttp.ts` — bearer-token JSON helpers built on `HttpClient`; maps non-OK responses
  to `ProviderApiRetryableError` / `ProviderApiNonRetryableError` via `isRetryableHttpStatus`.
- `ProviderRegistry.ts` — `PROVIDER_STRATEGIES` and `resolveStrategy(providerId)`, one
  `sendEmail` per provider behind a common interface. This replaced a `providerId` switch and is
  why there is no `MailDeliveryUtil.ts`: a new provider is a new map entry, not a new branch in a
  function someone has to remember to extend.
- `EmailMimeBuilder.ts` — MIME construction (`createEmail`, `buildAlternativeMimeBody`,
  `stripHtml`).
- `SnsDeliveryUtil.ts` — AWS SNS publish via `aws4fetch`, signature-v4 signing.
- `OAuth2ProviderUtil.ts` — provider OAuth2 config table, `buildAuthorizationUrl`,
  `exchangeCode`, `refreshAccessToken`.

There is no `gmail/GmailProviderUtil.ts` and no `outlook/OutlookProviderUtil.ts`. Profile lookups
were the last per-provider `if` branches; they moved into the strategy registry's send path.

## Provider Naming

- `google-gmail` / `oauth2`
- `microsoft-outlook` / `oauth2`
- `amazon-sns` / `access-keys`

`SUPPORTED_PROVIDER_CONNECTIONS` in `packages/shared/src/constants/Providers.ts` is the single
source of truth; `ProviderId` and `ConnectionMethod` derive from it.

Do not reintroduce password signup or user-managed refresh-token paste flows.

## Rules

- **One HTTP path.** Everything goes through `HttpClient`. A raw `fetch` skips status
  classification and turns a retryable provider `429`/`503` into a non-retryable 500. `SnsDeliveryUtil`
  is the exception: `aws4fetch` owns its own signing client, so it takes `timeoutMs` as a parameter
  instead (`PROVIDER_REQUEST_TIMEOUT_MS`).
- **Base64url lives in `@rexezuge/shared`** (`base64UrlEncode` / `toBase64Url`). `EmailMimeBuilder`
  delegates to it. Never spread a large `Uint8Array` into `String.fromCodePoint(...)` — a 1 MB MIME body exceeds
  the engine's argument limit.
- **Check `response.ok` before `JSON.parse`.** A non-JSON error body (HTML from an edge proxy,
  an empty 503) otherwise throws a bare `SyntaxError` that is not a `ServiceError`, so it is
  masked as an opaque 500 and the real cause is lost.
- **Bound every request** with `AbortSignal.timeout(...)`. Workers have no subrequest kill
  switch; a hung provider call holds the isolate to the platform limit.
- **Never build a `fetch` URL from an unencoded value.** `encodeURIComponent` any interpolated
  path segment (e.g. a Gmail message ID).
- **Sanitize provider error bodies** before they reach a log, a D1 column, or an HTTP response.
  Provider text can echo back request material.
- Do not branch on `providerId` with `if`/`switch` ladders in new code; extend the config table
  in `OAuth2ProviderUtil`, or add an entry to `PROVIDER_STRATEGIES` in `ProviderRegistry.ts`.
