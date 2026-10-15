import { BackgroundTaskRunDAO } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-runtime/base';
import { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { AbstractPruningTask } from './AbstractPruningTask';

class BackgroundTaskRunPruningTask extends AbstractPruningTask<BackgroundTaskRunPruningTaskEnv> {
  protected getRetentionDays(env: BackgroundTaskRunPruningTaskEnv): number {
    return AppConfigReader.fromEnv(env).backgroundTaskRunRetentionDays;
  }

  protected pruneBatch(_env: BackgroundTaskRunPruningTaskEnv, db: D1Queryable, cutoff: number, batchSize: number): Promise<number> {
    return new BackgroundTaskRunDAO(db).pruneOldRuns(cutoff, batchSize);
  }
}

interface BackgroundTaskRunPruningTaskEnv {
  DB: D1Database;
  BACKGROUND_TASK_RUN_RETENTION_DAYS?: string;
}

export { BackgroundTaskRunPruningTask };
