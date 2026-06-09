# Mail-Meow

Mail-Meow is a Cloudflare Worker for sending email through user-connected OAuth2 providers and publishing messages to Amazon SNS through user-connected AWS access keys.

## Architecture

- Backend: Hono + Chanfana on Cloudflare Workers.
- Frontend: Vite React SPA served at `/user`.
- Authentication: Cloudflare Zero Trust protects `/user/*`.
- Public delivery API: `/api/*` is not protected by Cloudflare; API keys stay in the path.
- Storage: Cloudflare D1, with encrypted connected-application credentials in D1.
- Secrets: `AES_ENCRYPTION_KEY_SECRET` from Cloudflare Secrets Store.

## Connected Applications

Users sign in through Cloudflare Zero Trust and create connected applications in the `/user` console.

Supported provider/method pairs:

- `google-gmail` / `oauth2`
- `microsoft-outlook` / `oauth2`
- `amazon-sns` / `access-keys`

For OAuth2 providers, users still create their OAuth app in Google or Microsoft. Mail-Meow generates a redirect URI for each connected application:

```text
https://<your-domain>/api/oauth2/callback/<applicationId>
```

The user adds that redirect URI to their OAuth app, then starts the OAuth2 flow from the Mail-Meow UI. Mail-Meow handles state, PKCE, callback processing, token exchange, and encrypted refresh-token storage.

## API Keys

API keys are scoped to one connected application.

- One user can create up to `MAX_APPLICATIONS_PER_USER` connected applications. Default: `99`.
- One connected application can have up to `MAX_API_KEYS_PER_APPLICATION` API keys. Default: `5`.
- API keys expire after `DEFAULT_API_KEY_EXPIRY_DAYS` by default. Default: `365`.
- API key expiry cannot exceed `MAX_API_KEY_EXPIRY_DAYS`. Default: `365`.

The raw API key is shown only once when created. Mail-Meow stores only a hash plus display metadata.

## Continuous Deployment Variables

GitHub Actions deployments can patch Worker `vars` without replacing the whole Wrangler configuration. Set the repository variable `WRANGLER_VARS_PATCH_JSON` to a JSON object of string values. The deployment merges it into top-level `vars` after loading `WRANGLER_JSONC` or `apps/api/wrangler.template.jsonc`.

```json
{
  "POLICY_AUD": "your-cloudflare-zero-trust-application-aud",
  "TEAM_DOMAIN": "https://your-cloudflare-zero-trust-team-domain.cloudflareaccess.com",
  "SERVE_SPA_FROM_WORKER": "true"
}
```

Do not put secrets in `WRANGLER_VARS_PATCH_JSON`; use GitHub secrets, Wrangler secrets, or Cloudflare Secrets Store for sensitive values.

## Delivery API

Send email with an API key connected to `google-gmail/oauth2` or `microsoft-outlook/oauth2`:

```bash
curl -X POST "https://mail.example.com/api/{api_key}/email" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "subject": "Hello",
    "text": "Message body"
  }'
```

Publish SNS with an API key connected to `amazon-sns/access-keys`:

```bash
curl -X POST "https://mail.example.com/api/{api_key}/sns" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Optional subject",
    "message": "Message body"
  }'
```

## Development

Use the local toolchain setup first:

```bash
source ~/.customrc
volta run pnpm install
volta run pnpm run dev
```

Quality checks:

```bash
source ~/.customrc
volta run pnpm run typecheck
volta run pnpm run test
volta run pnpm run build
```

For local Zero Trust development, set `DEV_AUTH_EMAIL` in the Worker environment to bypass Cloudflare Access headers.
