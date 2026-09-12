import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_ACCESS_KEYS,
} from '@mail-meow/shared/constants';
import { ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationCredentials, ConnectedApplicationMetadata } from '@mail-meow/shared/model';
import { BaseUrlUtil } from '@/utils';

class UpdateApplicationRoute extends IUserRoute<UpdateApplicationRequest, UpdateApplicationResponse, UpdateApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Update connected application',
    description:
      'Updates displayName and credentials for an application owned by the authenticated user. providerId and connectionMethod cannot be changed after creation. OAuth2 applications return to draft status after credential rotation until re-authorized; access-key applications stay connected.',
    requestBody: {
      description: 'Connected application fields to update',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['applicationId', 'displayName', 'providerId', 'connectionMethod'],
            properties: {
              applicationId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the application to update',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
              displayName: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 128,
                description: 'Human-readable application name',
                example: 'Gmail sender (updated)',
              },
              providerId: {
                type: 'string' as const,
                enum: ['google-gmail', 'microsoft-outlook', 'amazon-sns'],
                description: 'Delivery provider identifier; must match the existing application',
                example: 'google-gmail',
              },
              connectionMethod: {
                type: 'string' as const,
                enum: ['oauth2', 'access-keys'],
                description: 'Credential mechanism; must match the existing application',
                example: 'oauth2',
              },
              clientId: {
                type: 'string' as const,
                maxLength: 512,
                description: 'OAuth2 client ID (required for oauth2 applications)',
                example: '1234567890-abc.apps.googleusercontent.com',
              },
              clientSecret: {
                type: 'string' as const,
                maxLength: 2048,
                description: 'OAuth2 client secret (required for oauth2 applications)',
                example: 'GOCSPX-NewSecretValue',
              },
              accessKeyId: {
                type: 'string' as const,
                maxLength: 128,
                description: 'AWS access key ID (required for access-keys applications)',
                example: 'AKIAIOSFODNN7EXAMPLE',
              },
              secretAccessKey: {
                type: 'string' as const,
                maxLength: 512,
                description: 'AWS secret access key (required for access-keys applications)',
                example: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
              },
              topicArn: {
                type: 'string' as const,
                pattern: '^arn:aws:sns:[a-z0-9-]+:\\d{12}:[A-Za-z0-9_.-]+$',
                description: 'SNS topic ARN (required for access-keys applications)',
                example: 'arn:aws:sns:us-east-1:123456789012:order-notifications',
              },
            },
          },
          examples: {
            'update-oauth2': {
              summary: 'Rotate OAuth2 credentials',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                displayName: 'Gmail sender (updated)',
                providerId: 'google-gmail',
                connectionMethod: 'oauth2',
                clientId: '1234567890-abc.apps.googleusercontent.com',
                clientSecret: 'GOCSPX-NewSecretValue',
              },
            },
            'update-sns': {
              summary: 'Rotate SNS access keys',
              value: {
                applicationId: '223e4567-e89b-12d3-a456-426614174001',
                displayName: 'Order notifications (updated)',
                providerId: 'amazon-sns',
                connectionMethod: 'access-keys',
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                topicArn: 'arn:aws:sns:us-east-1:123456789012:order-notifications',
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Application updated',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['application'],
              properties: {
                application: {
                  type: 'object' as const,
                  required: ['applicationId', 'userEmail', 'displayName', 'providerId', 'connectionMethod', 'status', 'createdAt', 'updatedAt', 'oauth2RedirectUri'],
                  properties: {
                    applicationId: {
                      type: 'string' as const,
                      format: 'uuid',
                      description: 'Unique identifier of the updated application',
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
                      example: 'Gmail sender (updated)',
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
                      description: 'Status after update',
                      example: 'draft',
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
                      description: 'OAuth2 callback URI for this application',
                      example: 'https://mail.example.com/api/oauth2/callback/123e4567-e89b-12d3-a456-426614174000',
                    },
                  },
                },
              },
            },
            examples: {
              updated: {
                summary: 'Application after update',
                value: {
                  application: {
                    applicationId: '123e4567-e89b-12d3-a456-426614174000',
                    userEmail: 'john.doe@company.com',
                    displayName: 'Gmail sender (updated)',
                    providerId: 'google-gmail',
                    connectionMethod: 'oauth2',
                    status: 'draft',
                    createdAt: 1757548800,
                    updatedAt: 1757635200,
                    oauth2RedirectUri: 'https://mail.example.com/api/oauth2/callback/123e4567-e89b-12d3-a456-426614174000',
                  },
                },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request - application not found or immutable fields changed',
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
                      example: 'Provider and connection method cannot be changed after creation.',
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
        description: 'Internal server error while updating the application',
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
    request: UpdateApplicationRequest,
    env: UpdateApplicationEnv,
    cxt: RouteContext<UpdateApplicationEnv>,
  ): Promise<UpdateApplicationResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const existing: ConnectedApplicationMetadata | undefined = await dao.getMetadataByIdForUser(request.applicationId, userEmail);
    if (!existing) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (existing.providerId !== request.providerId || existing.connectionMethod !== request.connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }

    const credentials: ConnectedApplicationCredentials =
      request.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS
        ? {
            accessKeyId: request.accessKeyId!,
            secretAccessKey: request.secretAccessKey!,
            topicArn: request.topicArn!,
          }
        : {
            clientId: request.clientId!,
            clientSecret: request.clientSecret!,
          };
    const status: string =
      request.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS
        ? CONNECTED_APPLICATION_STATUS_CONNECTED
        : CONNECTED_APPLICATION_STATUS_DRAFT;
    const application: ConnectedApplicationMetadata | undefined = await dao.updateForUser(
      request.applicationId,
      userEmail,
      request.displayName,
      credentials,
      status,
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return {
      application: {
        ...application,
        oauth2RedirectUri: `${BaseUrlUtil.getBaseUrl(request.raw)}/api/oauth2/callback/${application.applicationId}`,
      },
    };
  }
}

interface UpdateApplicationRequest extends IRequest {
  applicationId: string;
  displayName: string;
  providerId: string;
  connectionMethod: string;
  clientId?: string;
  clientSecret?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  topicArn?: string;
}

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface UpdateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationEnv = IUserEnv;

export { UpdateApplicationRoute };
