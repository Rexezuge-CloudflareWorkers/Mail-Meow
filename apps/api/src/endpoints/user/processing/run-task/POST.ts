import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { Tokens, createRequestScope } from '@mail-meow/backend-services/composition';

class RunTaskNowRoute extends IUserRoute<RunTaskNowRequest, RunTaskNowResponse, RunTaskNowEnv> {
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
    responses: {
      '200': { description: 'Task triggered' },
    },
    security: [{ CloudflareAccess: [] }],
  };

  protected async handleRequest(
    request: RunTaskNowRequest,
    env: RunTaskNowEnv,
    cxt: RouteContext<RunTaskNowEnv>,
  ): Promise<RunTaskNowResponse> {
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const scope = createRequestScope(env);
    await scope.get(Tokens.ProcessingService).triggerTask(userEmail, request.taskType, request.applicationId, env);
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

interface RunTaskNowEnv extends IUserEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { RunTaskNowRoute };
