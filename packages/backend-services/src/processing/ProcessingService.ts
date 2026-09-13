import { BackgroundTaskRunDAO, ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import type { BackgroundTaskRunList, ListTaskRunsOptions } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import { BadRequestError, NotFoundError } from '@mail-meow/backend-errors';
import { BACKGROUND_TASK_TYPE_OAUTH2_REFRESH } from '@mail-meow/shared/constants';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

interface ProcessingServiceEnv {
  DB: D1Queryable;
}

interface TriggerTaskEnv extends ProcessingServiceEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret | { get(): Promise<string> };
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

interface ProcessingServiceDeps {
  taskRunDAO?: () => Promise<BackgroundTaskRunDAO>;
  applicationDAO?: (masterKey: string) => Promise<ConnectedApplicationDAO>;
  tokenService?: (env: TriggerTaskEnv) => OAuth2AccessTokenService;
}

class ProcessingService {
  private readonly deps: Required<ProcessingServiceDeps>;

  constructor(
    private readonly env: ProcessingServiceEnv,
    deps: ProcessingServiceDeps = {},
  ) {
    const db = env.DB;
    this.deps = {
      taskRunDAO: () => Promise.resolve(new BackgroundTaskRunDAO(db)),
      applicationDAO: (masterKey: string) => Promise.resolve(new ConnectedApplicationDAO(db, masterKey)),
      tokenService: (e: TriggerTaskEnv) => new OAuth2AccessTokenService(e),
      ...deps,
    };
  }

  public async listTaskRuns(
    userEmail: string,
    options: Pick<ListTaskRunsOptions, 'taskType' | 'applicationId' | 'status' | 'cursor' | 'latestPerType'>,
  ): Promise<BackgroundTaskRunList> {
    const dao = await this.deps.taskRunDAO();
    return dao.listForUser(userEmail, {
      taskType: options.taskType,
      applicationId: options.applicationId,
      status: options.status,
      cursor: options.cursor,
      latestPerType: options.latestPerType ?? !options.taskType,
    });
  }

  public async triggerTask(userEmail: string, taskType: string, applicationId: string, env: TriggerTaskEnv): Promise<void> {
    if (taskType !== BACKGROUND_TASK_TYPE_OAUTH2_REFRESH) {
      throw new BadRequestError(`Task type '${taskType}' cannot be triggered manually.`);
    }
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = await this.deps.applicationDAO(masterKey);
    const application = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) throw new NotFoundError('Connected application not found.');
    await this.deps.tokenService(env).refreshAccessToken(applicationId, { forceRefresh: true });
  }
}

export { ProcessingService };
export type { ProcessingServiceDeps, ProcessingServiceEnv, TriggerTaskEnv };
