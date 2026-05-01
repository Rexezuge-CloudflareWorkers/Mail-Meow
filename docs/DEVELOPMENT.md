# Mail-Meow Development

## Commands

```bash
source ~/.customrc
volta run npm install
volta run npm run dev
volta run npm run build
volta run npm run tsc
volta run npm run test
```

`npm run dev` starts the Vite SPA. The Worker entrypoint remains `src/index.ts` and is deployed by Wrangler after the SPA build embeds `app/dist/index.html` into `src/generated/spa-shell.ts`.

## Project Layout

- `app/`: Vite React SPA for `/user`.
- `components/`: shared frontend components and types.
- `src/workers/`: Worker assembly and route registration.
- `src/endpoints/`: file-routed Chanfana endpoint classes.
- `src/dao/`: D1 data access classes.
- `src/model/`: external camelCase models and internal snake_case row types.
- `src/schema/`: Zod request validation.
- `src/utils/`: API-key, OAuth2, delivery, timestamp, and identity helpers.
- `migrations/`: D1 migrations. Migration `0007_v3_reset_schema.sql` intentionally resets old v1/v2 tables.

## Route Model

Cloudflare Zero Trust protects `/user/*`. The middleware reads `Cf-Access-Authenticated-User-Email` and upserts the user row.

Protected user routes:

- `GET /user/me`
- `GET /user/applications`
- `POST /user/application`
- `PUT /user/application`
- `DELETE /user/application`
- `POST /user/application/oauth2/authorize`
- `GET /user/application/api-keys`
- `POST /user/application/api-key`
- `DELETE /user/application/api-key`

Public API routes:

- `GET /api/oauth2/callback/:applicationId`
- `POST /api/:api_key/email`
- `POST /api/:api_key/sns`

The OAuth2 callback is public because providers do not send Cloudflare Access headers. It is secured by short-lived one-time state plus PKCE.

## Provider Naming

- `google-gmail` / `oauth2`
- `microsoft-outlook` / `oauth2`
- `amazon-sns` / `access-keys`

## Configuration

`wrangler.jsonc.template` exposes these defaults:

- `MAX_APPLICATIONS_PER_USER=99`
- `MAX_API_KEYS_PER_APPLICATION=5`
- `DEFAULT_API_KEY_EXPIRY_DAYS=365`
- `MAX_API_KEY_EXPIRY_DAYS=365`
- `OAUTH2_STATE_EXPIRY_MINUTES=15`

Set `DEV_AUTH_EMAIL` only for local development without Cloudflare Access.
