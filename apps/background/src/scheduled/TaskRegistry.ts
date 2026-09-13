import { BackgroundTaskRunPruningTask } from './BackgroundTaskRunPruningTask';
import { OAuth2AccessTokenRefreshTask } from './OAuth2AccessTokenRefreshTask';
import type { IEnv, IScheduledTask } from './IScheduledTask';

type CronPhase = 1 | 2;

interface TaskDefinition {
  phase: CronPhase;
  make: () => IScheduledTask<IEnv>;
}

const CRON_TASK_DEFINITIONS: readonly TaskDefinition[] = [
  { phase: 1, make: () => new OAuth2AccessTokenRefreshTask() },
  { phase: 2, make: () => new BackgroundTaskRunPruningTask() },
];

function tasksForPhase(phase: CronPhase): IScheduledTask<IEnv>[] {
  return CRON_TASK_DEFINITIONS.filter((d) => d.phase === phase).map((d) => d.make());
}

export { CRON_TASK_DEFINITIONS, tasksForPhase };
export type { CronPhase, TaskDefinition };
