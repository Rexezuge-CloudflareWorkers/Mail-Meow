import { BackgroundTaskRunDAO } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

interface TaskRunSummary {
  itemsProcessed: number;
  itemsFailed: number;
  summary?: string;
  details?: unknown;
}

abstract class IScheduledTask<TEnv extends IEnv> {
  // Override to opt into automatic global run tracking via the Template Method.
  // Returning null (the default) runs the task without a global run record.
  protected getTaskType(): string | null {
    return null;
  }

  // Factory Method: override in tests to substitute the run-record DAO.
  protected createTaskRunDAO(db: D1Queryable): BackgroundTaskRunDAO {
    return new BackgroundTaskRunDAO(db);
  }

  public async handle(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const tEnv = env as unknown as TEnv;
    const taskType = this.getTaskType();
    const db: D1Queryable | undefined = 'DB' in tEnv ? (tEnv as unknown as { DB: D1Queryable }).DB : undefined;

    // Resolve the DAO once: the three call sites below all need it, and
    // re-instantiating per call re-runs the constructor for nothing.
    const dao: BackgroundTaskRunDAO | undefined = taskType && db ? this.createTaskRunDAO(db) : undefined;
    const runId: string | undefined = await dao?.startRun({ taskType: taskType as string }).catch((error: unknown) => {
      console.warn(`[${this.constructor.name}] Failed to start task run record:`, ErrorSanitizationUtil.sanitizeErrorForLogging(error));
      return undefined;
    });

    try {
      const result = await this.handleScheduledTask(event, tEnv, ctx);
      if (dao && runId) {
        await dao.succeedRun(runId, result ?? { itemsProcessed: 0, itemsFailed: 0 }).catch((error: unknown) => {
          console.warn(
            `[${this.constructor.name}] Failed to mark task run succeeded:`,
            ErrorSanitizationUtil.sanitizeErrorForLogging(error),
          );
        });
      }
    } catch (error: unknown) {
      const sanitized: string = ErrorSanitizationUtil.sanitizeErrorForLogging(error);
      console.error(`[${this.constructor.name}] Uncaught error:`, sanitized);
      if (dao && runId) {
        // last_error is persisted to D1 and read back through
        // GET /user/processing/task-runs, so it carries the same redaction as
        // the log line — String(error) would round-trip a token into the UI.
        await dao.failRun(runId, sanitized).catch((recordError: unknown) => {
          console.warn(
            `[${this.constructor.name}] Failed to mark task run failed:`,
            ErrorSanitizationUtil.sanitizeErrorForLogging(recordError),
          );
        });
      }
    }
  }

  // Return type is widened to TaskRunSummary | void for backward compatibility.
  // Existing tasks returning void satisfy this signature without changes.
  // New observable tasks return TaskRunSummary for richer run records.
  protected abstract handleScheduledTask(event: ScheduledController, env: TEnv, ctx: ExecutionContext): Promise<TaskRunSummary | void>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IEnv {}

export { IScheduledTask };
export type { IEnv, TaskRunSummary };
