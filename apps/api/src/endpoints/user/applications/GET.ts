import { ConnectedApplicationDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata } from '@mail-meow/shared/model';
import { BaseUrlUtil } from '@/utils';

class ListApplicationsRoute extends IUserRoute<ListApplicationsRequest, ListApplicationsResponse, ListApplicationsEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'List connected applications',
    description:
      'Returns all connected applications owned by the authenticated user. Each entry includes provider, connection method, status, and the computed oauth2RedirectUri that must be registered with the OAuth2 provider (Google/Microsoft) before completing authorization.',
    responses: {
      '200': {
        description: 'Connected applications',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['applications'],
              properties: {
                applications: {
                  type: 'array' as const,
                  description: 'Connected applications owned by the authenticated user',
                  items: {
                    type: 'object' as const,
                    required: ['applicationId', 'userEmail', 'displayName', 'providerId', 'connectionMethod', 'status', 'createdAt', 'updatedAt', 'oauth2RedirectUri'],
                    properties: {
                      applicationId: {
                        type: 'string' as const,
                        format: 'uuid',
                        description: 'Unique identifier of the connected application',
                        example: '123e4567-e89b-12d3-a456-426614174000',
                      },
                      userEmail: {
                        type: 'string' as const,
                        format: 'email',
                        description: 'Owner email address',
                        example: 'john.doe@company.com',
                      },
                      displayName: {
                        type: 'string' as const,
                        description: 'Human-readable application name',
                        example: 'Gmail sender',
                      },
                      providerId: {
                        type: 'string' as const,
                        enum: ['google-gmail', 'microsoft-outlook', 'amazon-sns'],
                        description: 'Delivery provider identifier',
                        example: 'google-gmail',
                      },
                      connectionMethod: {
                        type: 'string' as const,
                        enum: ['oauth2', 'access-keys'],
                        description: 'Credential mechanism used by the application',
                        example: 'oauth2',
                      },
                      status: {
                        type: 'string' as const,
                        enum: ['draft', 'connected'],
                        description: 'Whether the application completed authorization and can issue API keys',
                        example: 'connected',
                      },
                      createdAt: {
                        type: 'number' as const,
                        description: 'Unix timestamp in seconds when the application was created',
                        example: 1757548800,
                      },
                      updatedAt: {
                        type: 'number' as const,
                        description: 'Unix timestamp in seconds when the application was last updated',
                        example: 1757635200,
                      },
                      oauth2RedirectUri: {
                        type: 'string' as const,
                        format: 'uri',
                        description: 'Computed OAuth2 callback URI for this application (base URL + /api/oauth2/callback/:applicationId)',
                        example: 'https://mail.example.com/api/oauth2/callback/123e4567-e89b-12d3-a456-426614174000',
                      },
                    },
                  },
                },
              },
            },
            examples: {
              'with-applications': {
                summary: 'User with connected applications',
                value: {
                  applications: [
                    {
                      applicationId: '123e4567-e89b-12d3-a456-426614174000',
                      userEmail: 'john.doe@company.com',
                      displayName: 'Gmail sender',
                      providerId: 'google-gmail',
                      connectionMethod: 'oauth2',
                      status: 'connected',
                      createdAt: 1757548800,
                      updatedAt: 1757635200,
                      oauth2RedirectUri: 'https://mail.example.com/api/oauth2/callback/123e4567-e89b-12d3-a456-426614174000',
                    },
                    {
                      applicationId: '223e4567-e89b-12d3-a456-426614174001',
                      userEmail: 'john.doe@company.com',
                      displayName: 'Order notifications',
                      providerId: 'amazon-sns',
                      connectionMethod: 'access-keys',
                      status: 'connected',
                      createdAt: 1757548800,
                      updatedAt: 1757548800,
                      oauth2RedirectUri: 'https://mail.example.com/api/oauth2/callback/223e4567-e89b-12d3-a456-426614174001',
                    },
                  ],
                },
              },
              empty: {
                summary: 'User with no applications',
                value: { applications: [] },
              },
            },
          },
        },
      },
      '401': {
        description: 'Unauthorized - Missing or invalid authentication headers',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: {
                      type: 'string' as const,
                      example: 'Unauthorized',
                    },
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
        description: 'Internal server error while listing applications',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: {
                      type: 'string' as const,
                      example: 'InternalServerError',
                    },
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
    security: [
      {
        CloudflareAccess: [],
      },
    ],
  };

  protected async handleRequest(
    request: ListApplicationsRequest,
    env: ListApplicationsEnv,
    cxt: RouteContext<ListApplicationsEnv>,
  ): Promise<ListApplicationsResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const applications: ConnectedApplicationMetadata[] = await dao.listMetadataByUserEmail(this.getAuthenticatedUserEmailAddress(cxt));
    const baseUrl: string = BaseUrlUtil.getBaseUrl(request.raw);
    return {
      applications: applications.map((application: ConnectedApplicationMetadata) => ({
        ...application,
        oauth2RedirectUri: `${baseUrl}/api/oauth2/callback/${application.applicationId}`,
      })),
    };
  }
}

type ListApplicationsRequest = IRequest;

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface ListApplicationsResponse extends IResponse {
  applications: ApplicationResponse[];
}

type ListApplicationsEnv = IUserEnv;

export { ListApplicationsRoute };
