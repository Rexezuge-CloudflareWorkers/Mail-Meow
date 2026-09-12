import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_ACCESS_KEYS,
  DEFAULT_MAX_APPLICATIONS_PER_USER,
} from '@mail-meow/shared/constants';
import { ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationCredentials, ConnectedApplicationMetadata } from '@mail-meow/shared/model';
import { ConfigurationUtil, BaseUrlUtil } from '@/utils';

class CreateApplicationRoute extends IUserRoute<CreateApplicationRequest, CreateApplicationResponse, CreateApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Create connected application',
    description:
      'Creates a connected application for the authenticated user. OAuth2 providers (google-gmail, microsoft-outlook) require clientId and clientSecret and start in draft status until the OAuth2 authorization flow completes. Access-key providers (amazon-sns) require accessKeyId, secretAccessKey, and topicArn and start as connected. Supported combinations are google-gmail/oauth2, microsoft-outlook/oauth2, and amazon-sns/access-keys.',
    requestBody: {
      description: 'Connected application to create',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['displayName', 'providerId', 'connectionMethod'],
            properties: {
              displayName: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 128,
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
                description: 'Credential mechanism; must match the provider (gmail/outlook use oauth2, sns uses access-keys)',
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
                example: 'GOCSPX-AbCdEfGhIjKlMnOpQrStUv',
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
                description: 'SNS topic ARN that published messages are sent to (required for access-keys applications)',
                example: 'arn:aws:sns:us-east-1:123456789012:order-notifications',
              },
            },
          },
          examples: {
            'gmail-oauth2': {
              summary: 'Gmail OAuth2 application (starts as draft)',
              value: {
                displayName: 'Gmail sender',
                providerId: 'google-gmail',
                connectionMethod: 'oauth2',
                clientId: '1234567890-abc.apps.googleusercontent.com',
                clientSecret: 'GOCSPX-AbCdEfGhIjKlMnOpQrStUv',
              },
            },
            'outlook-oauth2': {
              summary: 'Outlook OAuth2 application (starts as draft)',
              value: {
                displayName: 'Outlook sender',
                providerId: 'microsoft-outlook',
                connectionMethod: 'oauth2',
                clientId: '00000000-1111-2222-3333-444444444444',
                clientSecret: 'super-secret-client-secret',
              },
            },
            'sns-access-keys': {
              summary: 'Amazon SNS application (starts as connected)',
              value: {
                displayName: 'Order notifications',
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
        description: 'Application created',
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
                      description: 'Unique identifier of the created application',
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
                      description: 'Initial status: draft for oauth2, connected for access-keys',
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
                      example: 1757548800,
                    },
                    oauth2RedirectUri: {
                      type: 'string' as const,
                      format: 'uri',
                      description: 'OAuth2 callback URI to register with the provider',
                      example: 'https://mail.example.com/api/oauth2/callback/123e4567-e89b-12d3-a456-426614174000',
                    },
                  },
                },
              },
            },
            examples: {
              'oauth2-draft': {
                summary: 'OAuth2 application created as draft',
                value: {
                  application: {
                    applicationId: '123e4567-e89b-12d3-a456-426614174000',
                    userEmail: 'john.doe@company.com',
                    displayName: 'Gmail sender',
                    providerId: 'google-gmail',
                    connectionMethod: 'oauth2',
                    status: 'draft',
                    createdAt: 1757548800,
                    updatedAt: 1757548800,
                    oauth2RedirectUri: 'https://mail.example.com/api/oauth2/callback/123e4567-e89b-12d3-a456-426614174000',
                  },
                },
              },
              'sns-connected': {
                summary: 'SNS application created as connected',
                value: {
                  application: {
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
                },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request - validation failed or application limit reached',
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
                      example: 'Invalid request body: providerId: providerId and connectionMethod are not a supported combination.',
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
        description: 'Internal server error while creating the application',
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
    request: CreateApplicationRequest,
    env: CreateApplicationEnv,
    cxt: RouteContext<CreateApplicationEnv>,
  ): Promise<CreateApplicationResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const maxApplications: number = ConfigurationUtil.getPositiveInteger(env.MAX_APPLICATIONS_PER_USER, DEFAULT_MAX_APPLICATIONS_PER_USER);
    if ((await dao.countByUserEmail(userEmail)) >= maxApplications) {
      throw new BadRequestError(`Maximum ${maxApplications} connected applications allowed per user.`);
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
    const application: ConnectedApplicationMetadata = await dao.create(
      userEmail,
      request.displayName,
      request.providerId,
      request.connectionMethod,
      credentials,
      status,
    );
    return {
      application: {
        ...application,
        oauth2RedirectUri: `${BaseUrlUtil.getBaseUrl(request.raw)}/api/oauth2/callback/${application.applicationId}`,
      },
    };
  }
}

interface CreateApplicationRequest extends IRequest {
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

interface CreateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

interface CreateApplicationEnv extends IUserEnv {
  MAX_APPLICATIONS_PER_USER?: string | undefined;
}

export { CreateApplicationRoute };
