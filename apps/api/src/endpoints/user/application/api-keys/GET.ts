import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { BadRequestError } from '@mail-meow/backend-errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationApiKeyMetadata } from '@mail-meow/shared/model';

class ListApplicationApiKeysRoute extends IUserRoute<ListApplicationApiKeysRequest, ListApplicationApiKeysResponse> {
  schema = {
    tags: ['API Keys'],
    summary: 'List application API keys',
    description:
      'Lists API key metadata for an application owned by the authenticated user. Only metadata is returned (prefix, last four, expiry); plaintext keys are only shown once at creation time.',
    parameters: [
      {
        name: 'applicationId',
        in: 'query' as const,
        required: true,
        description: 'Unique identifier of the application to list API keys for',
        schema: {
          type: 'string' as const,
          format: 'uuid',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    ],
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(
    request: ListApplicationApiKeysRequest,
    env: Env,
    cxt: RouteContext,
  ): Promise<ListApplicationApiKeysResponse> {
    const applicationId: string | null = new URL(request.raw.url).searchParams.get('applicationId');
    if (!applicationId) {
      throw new BadRequestError('applicationId is required.');
    }
    const scope = createRequestScope(env);
    return {
      apiKeys: await scope.apiKeys.listApiKeys(applicationId, this.getAuthenticatedAccount(cxt)),
    };
  }
}

type ListApplicationApiKeysRequest = IRequest;

interface ListApplicationApiKeysResponse extends IResponse {
  apiKeys: ApplicationApiKeyMetadata[];
}

export { ListApplicationApiKeysRoute };
