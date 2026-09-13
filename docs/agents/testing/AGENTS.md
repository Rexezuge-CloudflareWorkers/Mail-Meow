# Mail-Meow — Testing

Scope: unit + integration tests. Parent index: `../../../AGENTS.md`.

Current thresholds (`vitest.config.mts`): **statements 19 / branches 8 / functions 28 / lines 20** (baseline after Otter-pattern refactor; target Otter parity **88.5 / 76.5 / 90.5 / 89.5** as coverage is backfilled). Exclusions: `**/*.test.ts`, `**/*.d.ts`, `**/index.ts`, `**/types.d.ts`, `**/model/**` (pure TS types). Integration tests in `test/integration/` use `@cloudflare/vitest-pool-workers` (no V8 coverage — no thresholds there, omitted intentionally). God-file guard: `scripts/check-god-files.mjs` (soft 300 / hard 400 LOC; CI warn-only via `continue-on-error`). Locale guard: `apps/web/scripts/validate_locales.py` (JSON-valid, key parity incl. no extra keys, `{{placeholder}}` parity, no empty values; 12 locales).

**Covered** (test files exist): error classes, DI container, `Result`/`Cursor` value objects, `OAuth2ProviderUtil` token flows, `MailDeliveryUtil`, `ApiKeyUtil`, `TimestampUtil`, `MailMeowWorker` redirects, request-scope composition (`Tokens` + `createRequestScope`), web locale parity (12 locales).

**Still uncovered** (0% or near-0%): most DAOs (`ConnectedApplication`, `ApplicationApiKey`, `OAuth2Session`, `BackgroundTaskRun`, `OAuth2RefreshStatus`), services (`ApplicationService`, `ApiKeyService`, `OAuth2Authorization/AccessToken`, `Mail/SnsDelivery`, `UserService`, `ProcessingService`), background workers/tasks (`CronTasksWorker`, `OAuth2TokenRefreshWorker`, `OAuth2AccessTokenRefreshTask`), most routes (happy + validation/error paths), `D1Utils`, `IServiceError`, `VoidUtil`. Backfill order: services → DAOs → routes → background → utils.

**Mock patterns**:
- DAO tests: `createMockDb()` returning `prepare().bind().run/first/all` chain with shared `vi.fn()` refs.
- Services with DAOs: `vi.mock('@mail-meow/backend-data/dao')`.
- Crypto: `vi.mock('@mail-meow/backend-data/crypto')`.
- External APIs: mock provider client imports at package level.
- Use `vi.hoisted()` for mocks referenced across `vi.mock` factories.
- `beforeEach` + `vi.clearAllMocks()` resets call counts.
