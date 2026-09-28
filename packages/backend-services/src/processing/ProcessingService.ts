import type { BackgroundTaskRunDAO, ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import type { BackgroundTaskRunList, ListTaskRunsOptions } from '@mail-meow/backend-data/dao';
import { BadRequestError, NotFoundError } from '@mail-meow/backend-errors';
import { BACKGROUND_TASK_TYPE_OAUTH2_REFRESH } from '@mail-meow/shared/constants';
import type { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

type ListableRunOptions = Pick<ListTaskRunsOptions, 'taskType' | 'applicationId' | 'status' | 'cursor' | 'latestPerType'>;

interface ProcessingServiceDeps {
  taskRunDAO: () => Promise<BackgroundTaskRunDAO>;
  applicationDAO: () => Promise<ConnectedApplicationDAO>;
  accessTokenService: () => OAuth2AccessTokenService;
}

class ProcessingService {
  constructor(private readonly deps: ProcessingServiceDeps) {}

  /**
   * Lists run history for a user.
   *
   * `latestPerType` is implied when no `taskType` filter is given, so the
   * unfiltered view shows one row per task type instead of interleaving every
   * historical run.
   */
  public async listTaskRuns(userEmail: string, options: ListableRunOptions): Promise<BackgroundTaskRunList> {
    const dao: BackgroundTaskRunDAO = await this.deps.taskRunDAO();
    return dao.listForUser(userEmail, {
      taskType: options.taskType,
      applicationId: options.applicationId,
      status: options.status,
      cursor: options.cursor,
      latestPerType: options.latestPerType ?? !options.taskType,
    });
  }

  public async triggerTask(userEmail: string, taskType: string, applicationId: string): Promise<void> {
    // Only OAuth2 refresh is manually triggerable; the whitelist is the point,
    // so an unknown type is rejected rather than defaulted.
    if (taskType !== BACKGROUND_TASK_TYPE_OAUTH2_REFRESH) {
      throw new BadRequestError(`Task type '${taskType}' cannot be triggered manually.`);
    }
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    if (!(await applicationDAO.getByIdForUser(applicationId, userEmail))) {
      throw new NotFoundError('Connected application not found.');
    }
    await this.deps.accessTokenService().refreshAccessToken(applicationId, { forceRefresh: true });
  }
}

export { ProcessingService };
export type { ListableRunOptions, ProcessingServiceDeps };
