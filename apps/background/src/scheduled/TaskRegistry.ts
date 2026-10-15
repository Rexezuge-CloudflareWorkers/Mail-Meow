import { TaskRegistry } from '@rexezuge/runtime';
import { BackgroundTaskRunPruningTask } from './BackgroundTaskRunPruningTask';
import { OAuth2AccessTokenRefreshTask } from './OAuth2AccessTokenRefreshTask';
import type { IScheduledTask } from './MailMeowScheduledTask';
import type { ScheduledTaskEnv } from './MailMeowScheduledTask';

type CronPhase = 1 | 2;

interface TaskDefinition {
  phase: CronPhase;
  make: () => IScheduledTask<ScheduledTaskEnv>;
}

/**
 * The cron table, as `{phase, make}` pairs.
 *
 * `make` is a factory rather than an instance so nothing is constructed at module
 * load, before `env` exists. The previous `tasksForPhase` did the same; what is
 * new is that the result is fed to the kit's `TaskRegistry` rather than filtered
 * by hand — see {@link registryForRun}.
 */
const CRON_TASK_DEFINITIONS: readonly TaskDefinition[] = [
  { phase: 1, make: () => new OAuth2AccessTokenRefreshTask() },
  { phase: 2, make: () => new BackgroundTaskRunPruningTask() },
];

/**
 * A registry holding one fresh instance of every task, for a single run.
 *
 * Built per run rather than kept at module scope, and the reason is the base
 * class: `IScheduledTask` captures the invocation's `env` on the instance so its
 * run-recorder factory can reach the `DB` binding. A module-level instance would
 * carry one run's `env` into the next, which is only harmless because
 * `CronTasksWorker` happens to serialize its runs — a property of the caller, not
 * of the base. Fresh instances make it correct by construction instead.
 *
 * `TaskRegistry` rather than a filter because it is the thing that gives phases
 * meaning: `tasksForPhase` preserves registration order within a phase, and
 * `phases()` is ascending, so a new phase cannot be interleaved into an existing
 * one the way an index-based split could.
 */
function registryForRun(): TaskRegistry {
  const registry = new TaskRegistry();
  for (const definition of CRON_TASK_DEFINITIONS) {
    registry.register(definition.phase, definition.make());
  }
  return registry;
}

/**
 * The tasks in one phase, in registration order.
 */
function tasksForPhase(phase: number): readonly IScheduledTask<ScheduledTaskEnv>[] {
  return registryForRun().tasksForPhase(phase) as readonly IScheduledTask<ScheduledTaskEnv>[];
}

/**
 * Every phase that has at least one task, ascending.
 */
function cronPhases(): readonly number[] {
  return registryForRun().phases();
}

export { CRON_TASK_DEFINITIONS, cronPhases, tasksForPhase };
export type { CronPhase, TaskDefinition };
