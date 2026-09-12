import { ApplicationApiKeyDAO, ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata } from '@mail-meow/shared/model';

class DeleteApplicationApiKeyRoute extends IUserRoute<
  DeleteApplicationApiKeyRequest,
  DeleteApplicationApiKeyResponse,
  DeleteApplicationApiKeyEnv
> {
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
    responses: {
      '200': {
        description: 'Application API key deleted',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['success'],
              properties: {
                success: {
                  type: 'boolean' as const,
                  description: 'Whether the delete operation succeeded',
                  example: true,
                },
              },
            },
            examples: {
              deleted: {
                summary: 'API key deleted successfully',
                value: { success: true },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request - application not found or malformed ids',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: { type: 'string' as const, example: 'BadRequest' },
                    Message: {
                      type: 'string' as const,
                      description: 'Details about the invalid request',
                      example: 'Connected application was not found.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': {
        description: 'Unauthorized - Missing or invalid authentication',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: { type: 'string' as const, example: 'Unauthorized' },
                    Message: {
                      type: 'string' as const,
                      description: 'Authentication error details',
                      example: 'No Cloudflare Access JWT token provided in request headers.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '500': {
        description: 'Internal server error while deleting the API key',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: { type: 'string' as const, example: 'InternalServerError' },
                    Message: {
                      type: 'string' as const,
                      description: 'Error description',
                      example: 'The server encountered an internal error and was unable to complete your request.',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    security: [{ CloudflareAccess: [] }],
  };

  protected async handleRequest(
    request: DeleteApplicationApiKeyRequest,
    env: DeleteApplicationApiKeyEnv,
    cxt: RouteContext<DeleteApplicationApiKeyEnv>,
  ): Promise<DeleteApplicationApiKeyResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(
      request.applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    const apiKeyDAO: ApplicationApiKeyDAO = new ApplicationApiKeyDAO(env.DB);
    await apiKeyDAO.deleteForApplication(request.apiKeyId, request.applicationId);
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

type DeleteApplicationApiKeyEnv = IUserEnv;

export { DeleteApplicationApiKeyRoute };
