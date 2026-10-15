import { computeUnixCutoffSeconds, pruneInBatches } from '@mail-meow/backend-data/utils';
import { createD1SessionEnv } from '@mail-meow/backend-runtime/base';
import type { D1Queryable } from '@mail-meow/backend-runtime/base';
import { IScheduledTask } from './MailMeowScheduledTask';
import type { TaskRunSummary } from './MailMeowScheduledTask';

interface PruningTaskEnv {
  DB: D1Database;
}

/**
 * Template Method for retention-based pruning cron tasks.
 *
 * Subclasses supply the retention window (in days) and a single-batch delete
 * step; this base computes the unix cutoff, drains via the bounded
 * `pruneInBatches`, and returns a `TaskRunSummary`.
 */
abstract class AbstractPruningTask<TEnv extends PruningTaskEnv> extends IScheduledTask<TEnv> {
  protected abstract getRetentionDays(env: TEnv): number;

  protected abstract pruneBatch(env: TEnv, db: D1Queryable, cutoff: number, batchSize: number): Promise<number>;

  protected async handleScheduledTask(_event: ScheduledController, env: TEnv, _ctx: ExecutionContext): Promise<TaskRunSummary> {
    const retentionDays: number = this.getRetentionDays(env);
    const cutoff: number = computeUnixCutoffSeconds(retentionDays);
    const sessionEnv = createD1SessionEnv(env);
    const { deleted, exhausted } = await pruneInBatches((batchSize: number) => this.pruneBatch(env, sessionEnv.DB, cutoff, batchSize));
    console.log(`[${this.constructor.name}] deleted ${deleted} rows`);
    return {
      itemsProcessed: deleted,
      itemsFailed: 0,
      summary: exhausted
        ? `Deleted ${deleted} rows`
        : `Deleted ${deleted} rows; batch cap reached, remaining rows are pruned on the next run`,
    };
  }
}

export { AbstractPruningTask };
export type { PruningTaskEnv };
