# Mail-Meow — Background Worker

Scope: `apps/background/**`. Parent index: `../../AGENTS.md`.

- `CronTasksWorker.ts` — DO serializing cron in two phases via `scheduled/TaskRegistry.ts` (`tasksForPhase(1|2)`; add tasks there, not in the worker):
  - Phase 1 (parallel): `OAuth2AccessTokenRefreshTask`
  - Phase 2 (parallel): `BackgroundTaskRunPruningTask`
- Tasks resolve services via `createRequestScope(env)` from `@mail-meow/backend-services/composition` and call them directly (`scope.oauth2AccessTokens`, ...). Never `new XService(...)`. Config comes from `scope.config` (an `AppConfigReader`) rather than raw env reads.
- Shared scheduled bases: `IScheduledTask` (Template Method; override `getTaskType()` to opt into run tracking and `createTaskRunDAO` to substitute the DAO in tests), `AbstractPruningTask` (Template Method: `getRetentionDays` + `pruneBatch` abstract, cutoff + bounded `pruneInBatches` in base; `RepositoryHelper.pruneInBatches` in `backend-data/utils`).
- `OAuth2TokenRefreshWorker.ts` — DO for token refresh and auth-code exchange (per-application `idFromName`, `runExclusive` serialization).
- A per-item failure inside a task must record **why**, sanitized. `OAuth2AccessTokenRefreshTask` collects `applicationId: <sanitized reason>` per failure, logs it, and puts the first `MAX_REPORTED_FAILURES` (3) in both `summary` and a structured `details.failures`. It previously used a bare `catch {}` and reported only that an application failed, which made a revoked grant, an expired refresh token, and a provider outage indistinguishable in the record an operator reads. One bad mailbox must not abort the tick — keep going and count the rest.
- Error logging: never pass a caught error object to a `console.*` sink. Log a static context tag (task name, application ID) plus `ErrorSanitizationUtil.sanitizeErrorForLogging(error)` — the redacted `name: message` pair. A raw provider error can carry an `Authorization` header, an auth code, or a token-in-URL. The sanitizer's `.replaceAll` acts as a CodeQL `js/clear-text-logging` masking barrier, which is why the call must be the sanitizer and not a hand-rolled redaction. The same redaction applies to text persisted to D1 and read back through `GET /user/processing/task-runs` (`IScheduledTask` calls it once and reuses the string for both the log and `failRun`).

## Background Task Visibility

`ProcessingView` (`apps/web/src/components/views/`) exposes cron task run history. Routes:

- `GET /user/processing/task-runs` — `BackgroundTaskRunDAO`
- `POST /user/processing/run-task` — manual trigger via `ProcessingService` (only `oauth2_refresh`)

Retention: `BACKGROUND_TASK_RUN_RETENTION_DAYS` (default 30), pruned by `BackgroundTaskRunPruningTask`.
