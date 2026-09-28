export { ProcessingService } from './ProcessingService';
export type { ListableRunOptions, ProcessingServiceDeps } from './ProcessingService';
// Re-exported so routes and tests can name the shapes `ProcessingService` returns
// without reaching past the service layer into the DAO package.
export type { BackgroundTaskRun, BackgroundTaskRunList, BackgroundTaskRunStatus, ListTaskRunsOptions } from '@mail-meow/backend-data/dao';
