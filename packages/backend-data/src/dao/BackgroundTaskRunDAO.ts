import { CursorCodec, TimestampUtil, UUIDUtil } from '@rexezuge/shared';
import type { AccountIdentity } from '@mail-meow/shared/model';
import { BaseDAO, findRowById } from './BaseDAO';

const RUN_COLUMNS =
  'run_id, task_type, application_id, status, items_processed, items_failed, summary, details, error_message, started_at, completed_at, created_at';

/**
 * Cron task-run history, as an operator reads it through
 * `GET /user/processing/task-runs`.
 *
 * ## Ownership comes from the application, not the run
 *
 * A run has no owner of its own; it inherits one through
 * `INNER JOIN connected_applications`. That is the right shape — a run is a fact
 * about an application, and an application with no owner cannot be listed by
 * anyone — but it is why the `ca` alias is qualified everywhere. An unqualified
 * `user_id` in a two-table query is resolved by SQLite against the first table
 * in the `FROM`, which is `btr`, and `btr` has no such column.
 *
 * ## Retention, and why `running` is excluded from the prune
 *
 * {@link pruneOldRuns} never deletes a `running` row. A run that is old
 * *because it is stuck* is precisely the row an operator needs to see; deleting
 * it on age alone would erase the evidence and report the task as clean.
 */
class BackgroundTaskRunDAO extends BaseDAO {
  public async startRun(input: StartTaskRunInput): Promise<string> {
    const runId = UUIDUtil.getRandomUUID();
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `INSERT INTO background_task_runs
         (run_id, task_type, application_id, status, items_processed, items_failed, started_at, created_at)
       VALUES (?, ?, ?, 'running', 0, 0, ?, ?)`,
      [runId, input.taskType, input.applicationId ?? null, now, now],
    );
    return runId;
  }

  /**
   * Record a completed run.
   *
   * The status is derived here rather than passed in: `partial_success` is not a
   * thing a task decides, it is what "some items failed" *is*, and a caller
   * choosing it by hand is how a run with two failures out of ten gets recorded
   * as a clean success.
   */
  public async succeedRun(runId: string, input: CompleteTaskRunInput): Promise<void> {
    const status: BackgroundTaskRunStatus = input.itemsFailed > 0 ? 'partial_success' : 'success';
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `UPDATE background_task_runs
       SET status = ?, items_processed = ?, items_failed = ?, summary = ?, details = ?, completed_at = ?
       WHERE run_id = ?`,
      [
        status,
        input.itemsProcessed,
        input.itemsFailed,
        input.summary ?? null,
        input.details === undefined ? null : JSON.stringify(input.details),
        now,
        runId,
      ],
    );
  }

  /**
   * Record a failed run.
   *
   * `errorMessage` is the only field here that reaches a user, and it is written
   * by the caller after sanitization — see `apps/background/src/scheduled/
   * IScheduledTask.ts`, which sanitizes once and reuses the string for both the
   * log and this write, so the two can never disagree about what was redacted.
   */
  public async failRun(runId: string, errorMessage: string, partial?: Partial<CompleteTaskRunInput>): Promise<void> {
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `UPDATE background_task_runs
       SET status = 'error', error_message = ?, items_processed = ?, items_failed = ?,
           summary = ?, details = ?, completed_at = ?
       WHERE run_id = ?`,
      [
        errorMessage,
        partial?.itemsProcessed ?? 0,
        partial?.itemsFailed ?? 0,
        partial?.summary ?? null,
        partial?.details === undefined ? null : JSON.stringify(partial.details),
        now,
        runId,
      ],
    );
  }

  /**
   * Record a run that decided there was nothing to do.
   *
   * Distinct from success on purpose: "skipped" is the answer to "did the
   * background work?", and folding it into success makes a cron tick that never
   * ran indistinguishable from one that found no work.
   */
  public async skipRun(runId: string, reason?: string): Promise<void> {
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(`UPDATE background_task_runs SET status = 'skipped', summary = ?, completed_at = ? WHERE run_id = ?`, [
      reason ?? null,
      now,
      runId,
    ]);
  }

  public async getById(runId: string): Promise<BackgroundTaskRun | undefined> {
    const row = await findRowById<BackgroundTaskRunInternal>(this.database, 'background_task_runs', 'run_id', runId, RUN_COLUMNS);
    return row ? BackgroundTaskRunDAO.toRun(row) : undefined;
  }

  /**
   * One page of a caller's task-run history.
   *
   * A run is visible to whoever owns its application. Matching on the
   * application owner's *id* is what keeps task-run history visible across an
   * address change; the address clause is the fallback for applications whose
   * `user_id` backfill could not resolve them, and must not be dropped.
   */
  public async listForUser(user: AccountIdentity, options: ListTaskRunsOptions = {}): Promise<BackgroundTaskRunList> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    const conditions: string[] = [user.id ? '(ca.user_id = ? OR (ca.user_id IS NULL AND ca.user_email = ?))' : 'ca.user_email = ?'];
    const bindings: Array<string | number | null> = user.id ? [user.id, user.anchorEmail] : [user.anchorEmail];

    if (options.taskType) {
      conditions.push('btr.task_type = ?');
      bindings.push(options.taskType);
    }
    if (options.applicationId) {
      conditions.push('btr.application_id = ?');
      bindings.push(options.applicationId);
    }
    if (options.status) {
      conditions.push('btr.status = ?');
      bindings.push(options.status);
    }

    // The window function returns one row per task type, so it cannot be
    // paginated: there is no cursor to resume from, because there is no second
    // page. That is why `nextCursor` is left undefined on this branch rather
    // than derived — a cursor pointing at a page that does not exist is how a
    // client loops forever.
    if (options.latestPerType && !options.taskType) {
      const rows = await this.all<BackgroundTaskRunInternal>(
        `SELECT run_id, task_type, application_id, status,
                items_processed, items_failed, summary, details,
                error_message, started_at, completed_at, created_at
         FROM (
           SELECT btr.run_id, btr.task_type, btr.application_id, btr.status,
                  btr.items_processed, btr.items_failed, btr.summary, btr.details,
                  btr.error_message, btr.started_at, btr.completed_at, btr.created_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY btr.task_type
                    ORDER BY btr.started_at DESC, btr.run_id DESC
                  ) AS rn
           FROM background_task_runs btr
           INNER JOIN connected_applications ca ON ca.application_id = btr.application_id
           WHERE ${conditions.join(' AND ')}
         )
         WHERE rn = 1
         ORDER BY started_at DESC, run_id DESC`,
        bindings,
      );

      return {
        runs: rows.map((r) => BackgroundTaskRunDAO.toRun(r)),
        nextCursor: undefined,
      };
    }

    // Keyset pagination on `(started_at, run_id)` rather than an offset. An
    // offset would re-count rows that a concurrent prune deleted, so page 2
    // would silently skip a run; a keyset cannot. `run_id` is the tiebreak
    // because `started_at` is a whole second and two runs can share one.
    const cursor = BackgroundTaskRunDAO.parseCursor(options.cursor);
    if (cursor) {
      conditions.push('(btr.started_at < ? OR (btr.started_at = ? AND btr.run_id < ?))');
      bindings.push(cursor.startedAt, cursor.startedAt, cursor.runId);
    }

    const rows = await this.all<BackgroundTaskRunInternal>(
      `SELECT btr.run_id, btr.task_type, btr.application_id, btr.status,
              btr.items_processed, btr.items_failed, btr.summary, btr.details,
              btr.error_message, btr.started_at, btr.completed_at, btr.created_at
       FROM background_task_runs btr
       INNER JOIN connected_applications ca ON ca.application_id = btr.application_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY btr.started_at DESC, btr.run_id DESC
       LIMIT ?`,
      [...bindings, limit + 1],
    );

    const pageRows = rows.slice(0, limit);
    return {
      runs: pageRows.map((r) => BackgroundTaskRunDAO.toRun(r)),
      nextCursor: rows.length > limit ? BackgroundTaskRunDAO.encodeCursor(pageRows.at(-1)!.started_at, pageRows.at(-1)!.run_id) : undefined,
    };
  }

  /**
   * Delete a bounded batch of finished runs older than a cutoff.
   *
   * Bounded on both ends: the `IN (SELECT … LIMIT ?)` subquery bounds one
   * statement, and `RepositoryHelper.pruneInBatches` bounds how many statements
   * one invocation issues. An unbounded `DELETE` over a large backlog is what
   * exhausts a Durable Object's CPU budget — Cloudflare error 1102 — with the
   * work half done and the run reported as failed.
   *
   * `status != 'running'` is the predicate that keeps a stuck run visible. See
   * the class note.
   */
  public async pruneOldRuns(olderThan: number, limit: number): Promise<number> {
    const result = await this.run(
      `DELETE FROM background_task_runs
       WHERE run_id IN (
         SELECT run_id FROM background_task_runs
         WHERE started_at < ?
           AND status != 'running'
         ORDER BY started_at
         LIMIT ?
       )`,
      [olderThan, limit],
    );
    return result.meta?.changes ?? 0;
  }

  private static encodeCursor(startedAt: number, runId: string): string {
    return CursorCodec.encode({ startedAt, runId });
  }

  /**
   * A malformed cursor is "start from the beginning", not an error.
   *
   * `CursorCodec.decode` already swallows the parse failure and returns
   * `undefined`; the shape check below is the second half. A cursor whose
   * `startedAt` is not a number would otherwise bind `undefined` into the
   * comparison and silently filter the result set to nothing.
   */
  private static parseCursor(cursor: string | undefined): { startedAt: number; runId: string } | undefined {
    const parsed = CursorCodec.decode<{ startedAt?: unknown; runId?: unknown }>(cursor);
    if (!parsed || typeof parsed.startedAt !== 'number' || typeof parsed.runId !== 'string') return undefined;
    return { startedAt: parsed.startedAt, runId: parsed.runId };
  }

  private static toRun(row: BackgroundTaskRunInternal): BackgroundTaskRun {
    return {
      runId: row.run_id,
      taskType: row.task_type,
      applicationId: row.application_id,
      status: row.status,
      itemsProcessed: row.items_processed,
      itemsFailed: row.items_failed,
      summary: row.summary,
      details: row.details ? (JSON.parse(row.details) as unknown) : null,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    };
  }
}

type BackgroundTaskRunStatus = 'running' | 'success' | 'partial_success' | 'error' | 'skipped';

interface BackgroundTaskRun {
  runId: string;
  taskType: string;
  applicationId: string | null;
  status: BackgroundTaskRunStatus;
  itemsProcessed: number;
  itemsFailed: number;
  summary: string | null;
  details: unknown;
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
  createdAt: number;
}

interface BackgroundTaskRunInternal {
  run_id: string;
  task_type: string;
  application_id: string | null;
  status: BackgroundTaskRunStatus;
  items_processed: number;
  items_failed: number;
  summary: string | null;
  details: string | null;
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
  created_at: number;
}

interface BackgroundTaskRunList {
  runs: BackgroundTaskRun[];
  nextCursor?: string;
}

interface StartTaskRunInput {
  taskType: string;
  applicationId?: string;
}

interface CompleteTaskRunInput {
  itemsProcessed: number;
  itemsFailed: number;
  summary?: string;
  details?: unknown;
}

interface ListTaskRunsOptions {
  taskType?: string;
  applicationId?: string;
  status?: BackgroundTaskRunStatus;
  cursor?: string;
  limit?: number;
  latestPerType?: boolean;
}

export { BackgroundTaskRunDAO };
export type {
  BackgroundTaskRun,
  BackgroundTaskRunList,
  BackgroundTaskRunStatus,
  StartTaskRunInput,
  CompleteTaskRunInput,
  ListTaskRunsOptions,
};
