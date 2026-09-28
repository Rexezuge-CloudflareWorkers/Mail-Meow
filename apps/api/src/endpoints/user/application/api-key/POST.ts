import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';

import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationApiKeyMetadata } from '@mail-meow/shared/model';

class CreateApplicationApiKeyRoute extends IUserRoute<CreateApplicationApiKeyRequest, CreateApplicationApiKeyResponse> {
  schema = {
    tags: ['API Keys'],
    summary: 'Create application API key',
    description:
      'Creates an API key for a connected application owned by the authenticated user. The application must have status connected (OAuth2 authorization completed, or SNS access-key application). The plaintext apiKey is returned only once — store it securely, as later reads return metadata only.',
    requestBody: {
      description: 'API key to create',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['applicationId', 'name'],
            properties: {
              applicationId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the connected application',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
              name: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 128,
                description: 'Human-readable key name',
                example: 'CI pipeline',
              },
              expiresInDays: {
                type: 'number' as const,
                minimum: 1,
                description: 'Key lifetime in days; defaults to server default when omitted and cannot exceed the max',
                example: 90,
              },
            },
          },
          examples: {
            'default-expiry': {
              summary: 'Create key with default expiry',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                name: 'CI pipeline',
              },
            },
            'custom-expiry': {
              summary: 'Create key with custom expiry',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Order service',
                expiresInDays: 90,
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
    request: CreateApplicationApiKeyRequest,
    env: Env,
    cxt: RouteContext,
  ): Promise<CreateApplicationApiKeyResponse> {
    const scope = createRequestScope(env);
    const { metadata, apiKey } = await scope.apiKeys.createApiKey(
      request.applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
      request.name,
      request.expiresInDays,
    );
    return {
      apiKey,
      metadata,
    };
  }
}

interface CreateApplicationApiKeyRequest extends IRequest {
  applicationId: string;
  name: string;
  expiresInDays?: number;
}

interface CreateApplicationApiKeyResponse extends IResponse {
  apiKey: string;
  metadata: ApplicationApiKeyMetadata;
}

export { CreateApplicationApiKeyRoute };
