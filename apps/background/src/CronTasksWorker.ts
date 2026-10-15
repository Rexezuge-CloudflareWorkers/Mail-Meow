import { AbstractDurableObjectWorker } from '@mail-meow/backend-runtime/base';
import { ErrorSanitizationUtil } from '@rexezuge/shared';
import { cronPhases, tasksForPhase } from '@mail-meow/background/scheduled';

const CRON_TASKS_RUN_PATH: string = '/run';

interface CronTasksRunRequest {
  cron?: unknown;
  scheduledTime?: unknown;
}

class CronTasksWorker extends AbstractDurableObjectWorker<Env> {
  protected currentRun: Promise<void> | undefined;

  protected async onRequest(request: Request): Promise<Response> {
    const url: URL = new URL(request.url);
    if (url.pathname !== CRON_TASKS_RUN_PATH) {
      return Response.json({ error: 'Not Found' }, { status: 404 });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: { Allow: 'POST' } });
    }
    if (this.currentRun) {
      return Response.json({ status: 'already_running' }, { status: 202 });
    }

    const run: Promise<void> = this.runScheduledTaskRequest(request);
    this.currentRun = run;

    try {
      await run;
      return Response.json({ status: 'completed' });
    } catch (error: unknown) {
      // Tasks reach provider APIs on this path, so the caught error is redacted
      // before it reaches the log.
      console.error('Cron task run failed:', ErrorSanitizationUtil.sanitizeErrorForLogging(error));
      return Response.json({ status: 'failed' }, { status: 500 });
    } finally {
      if (this.currentRun === run) {
        this.currentRun = undefined;
      }
    }
  }

  protected async runScheduledTaskRequest(request: Request): Promise<void> {
    const event: ScheduledController = await this.createScheduledController(request);
    await this.runScheduledTasks(event);
  }

  protected async createScheduledController(request: Request): Promise<ScheduledController> {
    const payload: CronTasksRunRequest = await this.readRunRequest(request);
    return {
      cron: typeof payload.cron === 'string' ? payload.cron : '',
      scheduledTime: typeof payload.scheduledTime === 'number' ? payload.scheduledTime : Date.now(),
      noRetry: (): void => undefined,
    };
  }

  protected async readRunRequest(request: Request): Promise<CronTasksRunRequest> {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }

  /**
   * Run every phase, in order, each internally parallel.
   *
   * Phases come from the registry's own ordering rather than from a hardcoded
   * `for (let phase = 1; phase <= 2; ...)`. The two agree today, and they will not
   * tomorrow: a third phase added to `TaskRegistry` would be silently skipped by
   * a loop with a literal bound, and would run *concurrently* with the others if
   * someone widened the bound instead. Reading `phases()` means the only place
   * that knows how many phases exist is the registry.
   *
   * `Promise.all` per phase, not across phases: the split exists so pruning can
   * run behind the token refresh rather than behind it *and* beside it.
   *
   * A task that fails does not reject here — `IScheduledTask.swallowErrors` is
   * `true`, precisely because this fan-out has one verdict for the whole batch.
   */
  protected async runScheduledTasks(event: ScheduledController): Promise<void> {
    const ctx: ExecutionContext = this.createExecutionContext();
    for (const phase of cronPhases()) {
      await Promise.all(tasksForPhase(phase).map((task) => task.handle(event, this.env, ctx)));
    }
  }
}

export { CronTasksWorker };
