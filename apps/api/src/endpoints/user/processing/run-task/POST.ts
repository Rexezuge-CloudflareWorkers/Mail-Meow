import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { createRequestScope } from '@mail-meow/backend-services/composition';

class RunTaskNowRoute extends IUserRoute<RunTaskNowRequest, RunTaskNowResponse> {
  schema = {
    tags: ['Processing'],
    summary: 'Manually trigger OAuth2 token refresh for a connected application',
    description: 'Triggers oauth2_refresh for the given application owned by the authenticated user.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['taskType', 'applicationId'],
            properties: {
              taskType: { type: 'string' as const, example: 'oauth2_refresh' },
              applicationId: { type: 'string' as const, format: 'uuid' },
            },
          },
        },
      },
    },
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(request: RunTaskNowRequest, env: Env, cxt: RouteContext): Promise<RunTaskNowResponse> {
    const user = this.getAuthenticatedAccount(cxt);
    const scope = createRequestScope(env);
    await scope.processing.triggerTask(user, request.taskType, request.applicationId);
    return { triggered: true };
  }
}

interface RunTaskNowRequest extends IRequest {
  taskType: string;
  applicationId: string;
}

interface RunTaskNowResponse extends IResponse {
  triggered: boolean;
}

export { RunTaskNowRoute };
