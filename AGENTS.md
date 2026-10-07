# AGENTS.md

Guidance for agents working in Mail-Meow. `CLAUDE.md` is a symbolic link to this file. This is the global index — follow the links to scoped sub-guides before working in an area.

## Overview

Mail-Meow is a Cloudflare Worker API + Vite React SPA in a pnpm workspace (`@mail-meow/monorepo`, `packageManager: pnpm@11.2.2`).

- **Core**: Cloudflare Zero Trust on `/user/*` (JWT `cf-access-jwt-assertion`); public delivery endpoints under `/api/*` use API keys embedded in the path.
- **Identity**: `users.id` is the stable account key; the email address is a mutable attribute, so an address can change without touching the user's applications, API keys, or task-run history. Migration `0011_user_identity.sql` adds `users.id` + `users.current_email`, the `user_emails` address registry (`is_verified=1` may authenticate; a changed-from address is kept `is_verified=0` for attribution and released for re-registration), and a `user_id` FK on `connected_applications` (backfilled case-insensitively via the registry; `NULL` = a row written by pre-0011 code, still reachable through the `*_email` fallback). `users.email` is now the **frozen anchor** — immutable, and the target of the one surviving foreign key — because D1 honours neither `PRAGMA foreign_keys = off` nor `PRAGMA legacy_alter_table = on` and `defer_foreign_keys` does not suppress `ON DELETE CASCADE`, so that reference cannot be repointed without losing rows. Login resolves through `user_emails`; every user-keyed read matches `user_id` with the address as the pre-0011 fallback. `UserIdentityService` (`packages/backend-services/src/identity/`, one instance per request scope) owns `resolveAccount`/`resolveUserId`/`setPrimaryEmail`/`linkVerifiedEmail`; `UserService.upsertUser` is resolve-then-create via `user/accountLookup.ts`, so an address can never fork a second account. `setPrimaryEmail` is deliberately **not routed** — Access is the only authenticator, so a self-service change needs a proof-of-control confirm step first. Ops path: `scripts/change-email.ts`.
- **Background**: `apps/background` auto-refreshes OAuth2 tokens via `CronTasksWorker` DO (2-phase `TaskRegistry`) + `OAuth2TokenRefreshWorker` DO (per-application serialization, KV cache).
- **Providers**: `google-gmail`, `microsoft-outlook` (`oauth2`), `amazon-sns` (`access-keys`). See `packages/provider-clients/AGENTS.md`.
- **Features**: 12-locale i18n (frontend `apps/web/src/locales` + backend `packages/shared/src/i18n`), task-run visibility, API-key management. See Index below.

## Cloudflare Documentation

**STOP.** APIs, limits, and behavior change frequently. Before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, Workers AI, or Agents SDK task, retrieve current official docs.

- Workers: https://developers.cloudflare.com/workers/
- Cloudflare MCP: https://docs.mcp.cloudflare.com/mcp
- Node.js compat: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Worker errors: https://developers.cloudflare.com/workers/observability/errors/
- Limits: retrieve each product's `/platform/limits/` page (e.g. `/workers/platform/limits/`)
- Product refs: `/workers/`, `/kv/`, `/r2/`, `/d1/`, `/durable-objects/`, `/queues/`, `/vectorize/`, `/workers-ai/`, `/agents/`
- Error 1102 = CPU/memory exceeded; see `/workers/platform/limits/`.
- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/

## Commands

Plain `pnpm` is canonical (CI uses `pnpm/action-setup@v4` + `setup-node node 24`). No `source ~/.customrc`, no `volta run` prefix.

```bash
pnpm install
pnpm -r typecheck && pnpm run lint && pnpm run test:coverage && pnpm run test:integration
pnpm run lint:check      # report-only, no --fix
pnpm run prettier        # format; prettier:check verifies
pnpm --filter @mail-meow/web build   # only web has a build script
pnpm --filter @mail-meow/web dev     # vite dev server
pnpm run typegen   # after changing wrangler bindings
pnpm exec wrangler dev
pnpm exec wrangler deploy
```

`pnpm run lint` sets `NODE_OPTIONS=--max-old-space-size=6144`; type-aware ESLint on this
repo exceeds the default V8 heap on memory-constrained machines and would otherwise abort
with `FATAL ERROR: ... JavaScript heap out of memory` and leave `core.*` dumps behind.

`pnpm run lint` does **not** pass `--quiet`. Warnings are surfaced on purpose — a silent
warning backlog is how `prettier/prettier` drift and unsafe-`any` regressions accumulate.
`prettier/prettier` is an error, so formatting is gated by lint.

## Import Direction

```
Layer 0: shared, backend-errors          — zero @mail-meow/* deps
Layer 1: backend-runtime                 → layer 0 only
Layer 2: backend-data, provider-clients  → layer 0 only
Layer 3: backend-services                → layers 0–2 (not apps)
(no Layer 4 by design)
Layer 5: apps/background                 → layers 0–3 (provider-clients OK)
         apps/api                        → layers 0–3 + background (NOT provider-clients directly)
```

Enforced by ESLint `no-restricted-imports` in `eslint.config.mjs` (Layer 5 currently only blocks `apps/api → provider-clients`).

## Index

| Area                                            | Guide                                           |
| ----------------------------------------------- | ----------------------------------------------- |
| API worker, auth, routes                        | `apps/api/AGENTS.md`                            |
| Background worker, cron phases, task visibility | `apps/background/AGENTS.md`                     |
| Web SPA, frontend i18n, UI text conventions     | `apps/web/AGENTS.md`                            |
| Provider clients, naming                        | `packages/provider-clients/AGENTS.md`           |
| D1/DAO layer                                    | `packages/backend-data/AGENTS.md`               |
| Business logic, service domain map              | `packages/backend-services/AGENTS.md`           |
| Bindings, wrangler, env vars                    | `docs/agents/runtime/AGENTS.md`                 |
| Tests, thresholds, mock patterns                | `docs/agents/testing/AGENTS.md`                 |
| Email delivery                                  | `docs/agents/features/email-delivery/AGENTS.md` |

## Keeping AGENTS.md Current

Update the scoped sub-guide (not this index) as part of any change that adds, removes, or renames:

- Routes → `apps/api/AGENTS.md`
- Cron tasks/phases → `apps/background/AGENTS.md`
- Web UI, locales, text conventions → `apps/web/AGENTS.md`
- Providers → `packages/provider-clients/AGENTS.md`
- DAOs → `packages/backend-data/AGENTS.md`
- Services → `packages/backend-services/AGENTS.md` (+ feature file if cross-cutting)
- Env vars, bindings → `docs/agents/runtime/AGENTS.md`
- Tests, thresholds, mocks → `docs/agents/testing/AGENTS.md`
- Top-level features → `docs/agents/features/*/AGENTS.md` + one-line Overview touch-up here

## Provider Naming

- `google-gmail` / `oauth2`
- `microsoft-outlook` / `oauth2`
- `amazon-sns` / `access-keys`

Do not reintroduce password signup or user-managed refresh-token paste flows.
