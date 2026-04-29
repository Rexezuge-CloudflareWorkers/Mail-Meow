# AGENTS.md

Guidance for agents working in Mail-Meow.

## Overview

Mail-Meow is a Cloudflare Worker with a Vite React management UI. Cloudflare Zero Trust protects `/user/*`; public delivery endpoints under `/api/*` use API keys embedded in the path.

## Commands

Always source the user's toolchain setup before Node/npm commands:

```bash
source ~/.customrc
volta run npm install
volta run npm run dev
volta run npm run tsc
volta run npm run test
volta run npm run build
```

## Architecture

- `src/index.ts` exports a `MailMeowWorker`.
- `src/workers/MailMeowWorker.ts` registers all routes with Hono + Chanfana.
- `app/` contains the Vite SPA served for `/user`.
- `components/` contains shared frontend types and UI helpers.
- `src/endpoints/` uses file-routed endpoint classes.
- `src/dao/` owns D1 access.
- `src/schema/` owns Zod request validation.

## Auth And Routing

- `/user/*` is protected by Cloudflare Access and reads `Cf-Access-Authenticated-User-Email`.
- `DEV_AUTH_EMAIL` may be set locally to bypass Access headers.
- `/api/oauth2/callback/:applicationId` is public and secured by one-time state plus PKCE.
- `/api/:api_key/email` and `/api/:api_key/sns` are public and resolve the path API key through `application_api_keys`.

## Provider Naming

- `google-gmail` / `oauth2`
- `microsoft-outlook` / `oauth2`
- `amazon-sns` / `access-keys`

Do not reintroduce password signup or user-managed refresh-token paste flows.
