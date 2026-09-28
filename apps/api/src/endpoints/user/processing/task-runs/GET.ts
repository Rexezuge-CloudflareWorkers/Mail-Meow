import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import type { BackgroundTaskRun, BackgroundTaskRunStatus } from '@mail-meow/backend-services/processing';

class ListBackgroundTaskRunsRoute extends IUserRoute<ListBackgroundTaskRunsRequest, ListBackgroundTaskRunsResponse> {
  schema = {
    tags: ['Processing'],
    summary: 'List background task runs for the authenticated user',
    description: 'Returns cron task run history (OAuth2 refresh + pruning) for applications owned by the authenticated user.',
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(
    request: ListBackgroundTaskRunsRequest,
    env: Env,
    cxt: RouteContext,
  ): Promise<ListBackgroundTaskRunsResponse> {
    const scope = createRequestScope(env);
    return scope.processing.listTaskRuns(this.getAuthenticatedUserEmailAddress(cxt), {
      taskType: this.getQueryParam(request, 'taskType'),
      applicationId: this.getQueryParam(request, 'applicationId'),
      status: this.getQueryParam(request, 'status') as BackgroundTaskRunStatus | undefined,
      cursor: this.getQueryParam(request, 'cursor'),
    });
  }
}

type ListBackgroundTaskRunsRequest = IRequest;

interface ListBackgroundTaskRunsResponse extends IResponse {
  runs: BackgroundTaskRun[];
  nextCursor?: string;
}

export { ListBackgroundTaskRunsRoute };
