# Mail-Meow — Background Worker

Scope: `apps/background/**`. Parent index: `../../AGENTS.md`.

- `CronTasksWorker.ts` — DO serializing cron in two phases. `runScheduledTasks` iterates `cronPhases()` rather than a literal `1..2`, so a third phase added to the registry cannot be silently skipped — the registry is the only place that knows how many phases exist.
  - Phase 1 (parallel): `OAuth2AccessTokenRefreshTask`
  - Phase 2 (parallel): `BackgroundTaskRunPruningTask`
- Tasks call `createRequestScope(env)` from `@mail-meow/backend-services/composition` and resolve with `scope.get(Tokens.OAuth2AccessTokenService)` etc. Never `new XService(...)`. Config comes from `scope.get(Tokens.Config)` (an `AppConfigReader`) rather than raw env reads.
- `scheduled/TaskRegistry.ts` — the cron table as `{phase, make}` pairs fed to `@rexezuge/runtime`'s `TaskRegistry`. `make` is a factory, not an instance: nothing is constructed at module load, before `env` exists, and `tasksForPhase` returns **fresh instances per call**.
- `scheduled/MailMeowScheduledTask.ts` (exported as `IScheduledTask`) — `@rexezuge/runtime`'s `AbstractScheduledTask`, overriding three methods: `describeFailure` (sanitize before persisting — see below), `createRunRecorder` (binds `BackgroundTaskRunDAO`), and `swallowErrors` → `true`, because `CronTasksWorker` fans a phase out with `Promise.all` and answers one verdict for the batch. A throw would abandon every sibling mid-flight and report the tick as failed for work that had not finished; the per-task `failRun` row is written first either way.
- `AbstractPruningTask` (Template Method: `getRetentionDays` + `pruneBatch` abstract, cutoff + bounded `pruneInBatches` in base; `RepositoryHelper.pruneInBatches` in `backend-data/utils`).
- `OAuth2TokenRefreshWorker.ts` — DO for token refresh and auth-code exchange (per-application `idFromName`, `runExclusive` serialization).
- A per-item failure inside a task must record **why**, sanitized. `OAuth2AccessTokenRefreshTask` collects `applicationId: <sanitized reason>` per failure, logs it, and puts the first `MAX_REPORTED_FAILURES` (3) in both `summary` and a structured `details.failures`. It previously used a bare `catch {}` and reported only that an application failed, which made a revoked grant, an expired refresh token, and a provider outage indistinguishable in the record an operator reads. One bad mailbox must not abort the tick — keep going and count the rest.
- Error logging: never pass a caught error object to a `console.*` sink. Log a static context tag (task name, application ID) plus `ErrorSanitizationUtil.sanitizeErrorForLogging(error)` — the redacted `name: message` pair. A raw provider error can carry an `Authorization` header, an auth code, or a token-in-URL. The sanitizer's `.replaceAll` acts as a CodeQL `js/clear-text-logging` masking barrier, which is why the call must be the sanitizer and not a hand-rolled redaction.
- **The same redaction applies to text persisted to D1 and read back through `GET /user/processing/task-runs`.** That is what `IScheduledTask.describeFailure` is for: the kit's default is the error's own message, which is right for a console log and wrong for a row a user reads back. It produces a run record carrying a provider's bearer token and hands it to whoever loads the task-runs screen.

## Background Task Visibility

`ProcessingView` (`apps/web/src/components/views/`) exposes cron task run history. Routes:

- `GET /user/processing/task-runs` — `BackgroundTaskRunDAO`
- `POST /user/processing/run-task` — manual trigger via `ProcessingService` (only `oauth2_refresh`)

Retention: `BACKGROUND_TASK_RUN_RETENTION_DAYS` (default 30), pruned by `BackgroundTaskRunPruningTask`.
