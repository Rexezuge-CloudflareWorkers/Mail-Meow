import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';

import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';

class DeleteApplicationApiKeyRoute extends IUserRoute<DeleteApplicationApiKeyRequest, DeleteApplicationApiKeyResponse> {
  schema = {
    tags: ['API Keys'],
    summary: 'Delete application API key',
    description:
      'Deletes (revokes) an API key for an application owned by the authenticated user. Delivery calls using the key fail with 401 afterwards. Note: both ids are sent as a JSON body on this DELETE request.',
    requestBody: {
      description: 'API key to delete',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['applicationId', 'apiKeyId'],
            properties: {
              applicationId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the application the key belongs to',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
              apiKeyId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the API key to delete',
                example: '323e4567-e89b-12d3-a456-426614174002',
              },
            },
          },
          examples: {
            'delete-key': {
              summary: 'Revoke an API key',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                apiKeyId: '323e4567-e89b-12d3-a456-426614174002',
              },
            },
          },
        },
      },
    },
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(
    request: DeleteApplicationApiKeyRequest,
    env: Env,
    cxt: RouteContext,
  ): Promise<DeleteApplicationApiKeyResponse> {
    const scope = createRequestScope(env);
    await scope.apiKeys.deleteApiKey(request.apiKeyId, request.applicationId, this.getAuthenticatedAccount(cxt));
    return { success: true };
  }
}

interface DeleteApplicationApiKeyRequest extends IRequest {
  applicationId: string;
  apiKeyId: string;
}

interface DeleteApplicationApiKeyResponse extends IResponse {
  success: boolean;
}

export { DeleteApplicationApiKeyRoute };
