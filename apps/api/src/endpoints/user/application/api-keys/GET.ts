import { ApplicationApiKeyDAO, ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationApiKeyMetadata, ConnectedApplicationMetadata } from '@mail-meow/shared/model';

class ListApplicationApiKeysRoute extends IUserRoute<
  ListApplicationApiKeysRequest,
  ListApplicationApiKeysResponse,
  ListApplicationApiKeysEnv
> {
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
    responses: {
      '200': {
        description: 'Application API keys',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['apiKeys'],
              properties: {
                apiKeys: {
                  type: 'array' as const,
                  description: 'API key metadata for the application (no plaintext secrets)',
                  items: {
                    type: 'object' as const,
                    required: ['apiKeyId', 'applicationId', 'name', 'keyPrefix', 'keyLastFour', 'createdAt', 'expiresAt'],
                    properties: {
                      apiKeyId: {
                        type: 'string' as const,
                        format: 'uuid',
                        description: 'Unique identifier of the API key',
                        example: '323e4567-e89b-12d3-a456-426614174002',
                      },
                      applicationId: {
                        type: 'string' as const,
                        format: 'uuid',
                        description: 'Application the key belongs to',
                        example: '123e4567-e89b-12d3-a456-426614174000',
                      },
                      name: {
                        type: 'string' as const,
                        description: 'Human-readable key name',
                        example: 'CI pipeline',
                      },
                      keyPrefix: {
                        type: 'string' as const,
                        description: 'First 10 characters of the plaintext key for identification',
                        example: 'mm_K7mP2xQ',
                      },
                      keyLastFour: {
                        type: 'string' as const,
                        description: 'Last 4 characters of the plaintext key for identification',
                        example: 'N2pQ',
                      },
                      createdAt: {
                        type: 'number' as const,
                        description: 'Unix timestamp in seconds when the key was created',
                        example: 1757548800,
                      },
                      expiresAt: {
                        type: 'number' as const,
                        description: 'Unix timestamp in seconds when the key expires',
                        example: 1789084800,
                      },
                      lastUsedAt: {
                        type: 'number' as const,
                        description: 'Unix timestamp in seconds when the key was last used to call a delivery endpoint',
                        example: 1757635200,
                      },
                    },
                  },
                },
              },
            },
            examples: {
              'with-keys': {
                summary: 'Application with API keys',
                value: {
                  apiKeys: [
                    {
                      apiKeyId: '323e4567-e89b-12d3-a456-426614174002',
                      applicationId: '123e4567-e89b-12d3-a456-426614174000',
                      name: 'CI pipeline',
                      keyPrefix: 'mm_K7mP2xQ',
                      keyLastFour: 'N2pQ',
                      createdAt: 1757548800,
                      expiresAt: 1789084800,
                      lastUsedAt: 1757635200,
                    },
                  ],
                },
              },
              empty: {
                summary: 'Application with no API keys',
                value: { apiKeys: [] },
              },
            },
          },
        },
      },
      '400': {
        description: 'Bad request - Missing applicationId or application not found',
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
        description: 'Internal server error while listing API keys',
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
    request: ListApplicationApiKeysRequest,
    env: ListApplicationApiKeysEnv,
    cxt: RouteContext<ListApplicationApiKeysEnv>,
  ): Promise<ListApplicationApiKeysResponse> {
    const applicationId: string | null = new URL(request.raw.url).searchParams.get('applicationId');
    if (!applicationId) {
      throw new BadRequestError('applicationId is required.');
    }
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(
      applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    const apiKeyDAO: ApplicationApiKeyDAO = new ApplicationApiKeyDAO(env.DB);
    return {
      apiKeys: await apiKeyDAO.listByApplication(applicationId),
    };
  }
}

type ListApplicationApiKeysRequest = IRequest;

interface ListApplicationApiKeysResponse extends IResponse {
  apiKeys: ApplicationApiKeyMetadata[];
}

type ListApplicationApiKeysEnv = IUserEnv;

export { ListApplicationApiKeysRoute };
