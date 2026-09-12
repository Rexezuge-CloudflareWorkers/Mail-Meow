import { ConnectedApplicationDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';

class DeleteApplicationRoute extends IUserRoute<DeleteApplicationRequest, DeleteApplicationResponse, DeleteApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Delete connected application',
    description:
      'Deletes a connected application owned by the authenticated user, including its API keys, OAuth2 sessions, and encrypted credentials. This operation cannot be undone. Note: the applicationId is sent as a JSON body on this DELETE request.',
    requestBody: {
      description: 'Application to delete',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['applicationId'],
            properties: {
              applicationId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the application to delete',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
            },
          },
          examples: {
            'delete-application': {
              summary: 'Delete an application',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Application deleted',
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
                summary: 'Application deleted successfully',
                value: { success: true },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request - missing or malformed applicationId',
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
                      example: 'BadRequest',
                    },
                    Message: {
                      type: 'string' as const,
                      description: 'Details about the invalid request',
                      example: 'Invalid request body: applicationId: Value must be a valid UUID.',
                    },
                  },
                },
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
        description: 'Internal server error while deleting the application',
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
    request: DeleteApplicationRequest,
    env: DeleteApplicationEnv,
    cxt: RouteContext<DeleteApplicationEnv>,
  ): Promise<DeleteApplicationResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    await dao.deleteForUser(request.applicationId, this.getAuthenticatedUserEmailAddress(cxt));
    return { success: true };
  }
}

interface DeleteApplicationRequest extends IRequest {
  applicationId: string;
}

interface DeleteApplicationResponse extends IResponse {
  success: boolean;
}

type DeleteApplicationEnv = IUserEnv;

export { DeleteApplicationRoute };
