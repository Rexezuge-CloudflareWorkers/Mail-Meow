# Mail-Meow — Background Worker

Scope: `apps/background/**`. Parent index: `../../AGENTS.md`.

- `CronTasksWorker.ts` — DO serializing cron in two phases via `scheduled/TaskRegistry.ts` (`tasksForPhase(1|2)`; add tasks there, not in the worker):
  - Phase 1 (parallel): `OAuth2AccessTokenRefreshTask`
  - Phase 2 (parallel): `BackgroundTaskRunPruningTask`
- Tasks resolve services via `createRequestScope(env)` from `@mail-meow/backend-services/composition` (`scope.get(Tokens.X)`); never `new XService(env)` in new code.
- Shared scheduled bases: `IScheduledTask` (Template Method + `createApplicationRun` Builder + `createTaskRunDAO` Factory Method for tests), `AbstractPruningTask` (Template Method: `getRetentionDays` + `pruneBatch` abstract, cutoff + `pruneInBatches` in base; `RepositoryHelper.pruneInBatches` in `backend-data/utils`).
- `OAuth2TokenRefreshWorker.ts` — DO for token refresh and auth-code exchange (per-application `idFromName`, `runExclusive` serialization).
- Error logging in token-adjacent `try` blocks: log static messages with application IDs only — never interpolate the caught error (CodeQL `js/clear-text-logging`).

## Background Task Visibility

`ProcessingView` (`apps/web/src/components/views/`) exposes cron task run history. Routes:
- `GET /user/processing/task-runs` — `BackgroundTaskRunDAO`
- `POST /user/processing/run-task` — manual trigger via `ProcessingService` (only `oauth2_refresh`)

Retention: `BACKGROUND_TASK_RUN_RETENTION_DAYS` (default 30), pruned by `BackgroundTaskRunPruningTask`.
