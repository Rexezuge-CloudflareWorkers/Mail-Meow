import { BackgroundTaskRunDAO } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-runtime/base';
import { AbstractScheduledTask } from '@rexezuge/runtime';
import type { TaskRunRecorder } from '@rexezuge/runtime';
import { ErrorSanitizationUtil } from '@rexezuge/shared';

/**
 * `handle`'s parameters, taken from the base rather than written out.
 *
 * The kit types them structurally (`ScheduledControllerLike`,
 * `ExecutionContextLike`) and does not export those names, because they exist so
 * `runtime` can typecheck without `@cloudflare/workers-types` installed.
 * `Parameters<...['handle']>` reads them off the public class without
 * re-declaring a second, near-identical shape here that could drift.
 */
type HandleEvent<TEnv extends ScheduledTaskEnv> = Parameters<AbstractScheduledTask<TEnv>['handle']>[0];
type HandleContext<TEnv extends ScheduledTaskEnv> = Parameters<AbstractScheduledTask<TEnv>['handle']>[2];

/**
 * The binding a cron task needs to open a D1 session.
 *
 * Structural rather than a generated `Env`, for the same reason the kit's base is
 * structural: `runtime` typechecks with no platform types installed. A cron task
 * builds its own session env because it must — a background tick is not a
 * request, so there is no `x-d1-bookmark` to round-trip and a fresh session is
 * the correct consistency model.
 */
interface ScheduledTaskEnv {
  DB?: D1Database;
}

/**
 * Mail-Meow's scheduled-task base: the kit's, with three overrides.
 *
 * The kit's `AbstractScheduledTask` is the converged Template Method — its own
 * header names Mail-Otter's copy, which was converged from this repo's
 * `IScheduledTask`. It is adopted as-is except where this deployment's behaviour
 * differs, and each difference below is a decision rather than an accident.
 */
abstract class MailMeowScheduledTask<TEnv extends ScheduledTaskEnv = ScheduledTaskEnv> extends AbstractScheduledTask<TEnv> {
  /**
   * The invocation's `env`, captured for {@link createRunRecorder}.
   *
   * The kit's Factory Method takes no arguments — it is called from `handle`
   * before `handleScheduledTask`, so a subclass that needs the binding has no
   * other way to reach it. Storing it on the instance is safe *because* a task
   * instance is created fresh per run by `TaskRegistry` and discarded when the
   * run ends: there is no second `handle` to interleave with, and no cross-request
   * state to leak. Set for the duration of `handle` and cleared in a `finally`, so
   * a settled task does not retain a binding object.
   */
  private invocationEnv: unknown;

  public override async handle(event: HandleEvent<TEnv>, env: TEnv, ctx: HandleContext<TEnv>): Promise<void> {
    this.invocationEnv = env;
    try {
      await super.handle(event, env, ctx);
    } finally {
      this.invocationEnv = undefined;
    }
  }

  /**
   * How a caught error becomes the `errorMessage` written to the run record.
   *
   * Sanitized, and deliberately the *same* string the log line uses. The raw
   * `error.message` is what the kit's default would write, and on this path it
   * can be a provider response body carrying an `Authorization` header or a token
   * in a URL — which `failRun` would then store in D1 and hand back through
   * `GET /user/processing/task-runs`. This is the seam the kit documents as "a
   * repo with that exposure overrides this"; the kit cannot do it itself, because
   * `runtime` deliberately has no dependency on the redactor.
   */
  protected override describeFailure(error: unknown): string {
    return ErrorSanitizationUtil.sanitizeErrorForLogging(error);
  }

  /**
   * Factory Method for the recorder, satisfied with this repo's DAO.
   *
   * `null` when the environment has no `DB`. A task that cannot record still
   * runs: a missing binding is a deployment mistake, and the run-record table is
   * not where to discover it.
   */
  protected override createRunRecorder(): TaskRunRecorder | null {
    const db: D1Queryable | undefined = MailMeowScheduledTask.readDatabase(this.invocationEnv);
    return db === undefined ? null : new BackgroundTaskRunDAO(db);
  }

  /**
   * Record the failure, then absorb it.
   *
   * `CronTasksWorker` runs a phase with `Promise.all` and answers one verdict for
   * the whole batch, so letting one task throw would abandon every sibling still
   * in flight and report the tick as failed for work that had not finished — a
   * worse record than the task's own failed row, which is written before this
   * decision is consulted. Recording happens either way; this only changes who
   * learns about it.
   */
  protected override swallowErrors(): boolean {
    return true;
  }

  /**
   * Narrow `unknown` to a D1 handle.
   *
   * Duck-typed on `prepare` rather than `instanceof D1Database`, which cannot be
   * written: `D1Database` is a Workers *types* declaration and does not exist at
   * runtime, so a unit test's double is the same shape by necessity.
   */
  private static readDatabase(env: unknown): D1Queryable | undefined {
    if (env === null || typeof env !== 'object') return undefined;
    const value: unknown = (env as Record<string, unknown>)['DB'];
    if (value === null || typeof value !== 'object') return undefined;
    return typeof (value as D1Queryable).prepare === 'function' ? (value as D1Queryable) : undefined;
  }
}

export { MailMeowScheduledTask as IScheduledTask };
export type { ScheduledTaskEnv };
/**
 * The historical name for {@link ScheduledTaskEnv}. Every task's `*Env` interface
 * used to extend an empty `IEnv` marker, which existed only so a task could
 * declare "this environment and nothing more". The kit's `ScheduledTaskEnv` is
 * that same idea with content — `DB` is the one binding a cron task genuinely
 * needs — so the marker is gone and the tasks declare `DB` directly.
 */
export type { ScheduledTaskEnv as IEnv };
export { type TaskRunSummary } from '@rexezuge/runtime';
