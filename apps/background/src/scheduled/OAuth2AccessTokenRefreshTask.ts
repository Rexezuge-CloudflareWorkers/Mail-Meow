import { OAuth2AccessTokenRefreshStatusDAO } from '@mail-meow/backend-data/dao';
import { createD1SessionEnv } from '@mail-meow/backend-data/utils';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { BACKGROUND_TASK_TYPE_OAUTH2_REFRESH } from '@mail-meow/shared/constants';
import { ErrorSanitizationUtil, TimestampUtil } from '@mail-meow/shared/utils';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

/**
 * How many individual failures to name in the run summary.
 *
 * The batch is bounded by `oauth2TokenRefreshBatchSize`, so the per-failure list
 * is bounded too. Capped because a provider-wide outage fails every application
 * at once, and a 25-line error dump in a summary column helps nobody.
 */
const MAX_REPORTED_FAILURES = 3;

class OAuth2AccessTokenRefreshTask extends IScheduledTask<OAuth2AccessTokenRefreshTaskEnv> {
  protected getTaskType(): string {
    return BACKGROUND_TASK_TYPE_OAUTH2_REFRESH;
  }

  protected async handleScheduledTask(
    _event: ScheduledController,
    env: OAuth2AccessTokenRefreshTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    const scope = createRequestScope(env);
    const refreshWindowSeconds: number = scope.config.oauth2AccessTokenRefreshWindowSeconds;
    const batchSize: number = scope.config.oauth2TokenRefreshBatchSize;
    const refreshBefore: number = TimestampUtil.getCurrentUnixTimestampInSeconds() + refreshWindowSeconds;
    const sessionEnv = createD1SessionEnv(env);
    const statusDAO = new OAuth2AccessTokenRefreshStatusDAO(sessionEnv.DB);
    const applicationIds: string[] = await statusDAO.listDueApplicationIds(refreshBefore, batchSize);

    let refreshed = 0;
    const failures: string[] = [];
    for (const applicationId of applicationIds) {
      try {
        await scope.oauth2AccessTokens.refreshAccessToken(applicationId, { forceRefresh: true });
        refreshed++;
      } catch (error: unknown) {
        // The reason is what makes this actionable. A bare `catch {}` reported
        // only that *an* application failed, so a revoked grant, an expired
        // refresh token, and a provider outage were indistinguishable in the
        // log and in the run record the UI displays.
        //
        // Sanitized, never the raw object: this path carries provider
        // Authorization headers and client secrets, and the summary is
        // persisted to D1 and served back through the task-runs API.
        const reason: string = ErrorSanitizationUtil.sanitizeErrorForLogging(error);
        failures.push(`${applicationId}: ${reason}`);
        console.error(`Failed to refresh OAuth2 access token for application ${applicationId}:`, reason);
      }
    }

    const failed: number = failures.length;
    return {
      itemsProcessed: refreshed,
      itemsFailed: failed,
      summary: summarize(applicationIds.length, refreshed, failures),
      // Structured as well as human-readable, so a run can be triaged without
      // parsing the summary string.
      details: failed === 0 ? undefined : { failures: failures.slice(0, MAX_REPORTED_FAILURES), totalFailures: failed },
    };
  }
}

/**
 * Names the first few failures so the record says what went wrong, not just how
 * much. Falls back to a count-only summary when the batch was empty or fully
 * successful, which is the common case and should not read as an incident.
 */
function summarize(total: number, refreshed: number, failures: string[]): string {
  const base: string = `Refreshed ${refreshed} of ${total} tokens`;
  if (failures.length === 0) return base;
  const shown: string[] = failures.slice(0, MAX_REPORTED_FAILURES);
  const remainder: number = failures.length - shown.length;
  return `${base}; ${failures.length} failed — ${shown.join('; ')}${remainder > 0 ? `; +${remainder} more` : ''}`;
}

interface OAuth2AccessTokenRefreshTaskEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS?: string;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OAUTH2_TOKEN_REFRESH_BATCH_SIZE?: string;
}

export { OAuth2AccessTokenRefreshTask };
