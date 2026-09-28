import { OAuth2AccessTokenRefreshStatusDAO } from '@mail-meow/backend-data/dao';
import { createD1SessionEnv } from '@mail-meow/backend-data/utils';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { BACKGROUND_TASK_TYPE_OAUTH2_REFRESH } from '@mail-meow/shared/constants';
import { TimestampUtil } from '@mail-meow/shared/utils';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv, TaskRunSummary } from './IScheduledTask';

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
    let failed = 0;
    for (const applicationId of applicationIds) {
      try {
        await scope.oauth2AccessTokens.refreshAccessToken(applicationId, { forceRefresh: true });
        refreshed++;
      } catch {
        failed++;
        console.error(`Failed to refresh OAuth2 access token for application ${applicationId}`);
      }
    }
    return {
      itemsProcessed: refreshed,
      itemsFailed: failed,
      summary: `Refreshed ${refreshed} of ${applicationIds.length} tokens`,
    };
  }
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
