import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_ACCESS_KEYS, PROVIDER_AMAZON_SNS } from '@mail-meow/shared/constants';
import { BadRequestError } from '@/error';
import { IPublicApplicationRoute } from '@/endpoints/IPublicApplicationRoute';
import type { IPublicApplicationEnv, IPublicApplicationRequest, IResponse, RouteContext } from '@/endpoints/IPublicApplicationRoute';
import type { AccessKeyCredentials } from '@mail-meow/shared/model';
import { SnsDeliveryUtil } from '@/utils';

class SendSNSRoute extends IPublicApplicationRoute<SendSNSRequest, SendSNSResponse, SendSNSEnv> {
  schema = {
    tags: ['Delivery'],
    summary: 'Publish SNS message',
    description:
      'Public delivery endpoint that publishes a message to the SNS topic stored on the application linked to the path API key. The key must belong to an amazon-sns access-keys application with status connected.',
    parameters: [
      {
        name: 'api_key',
        in: 'path' as const,
        required: true,
        description: 'Plaintext application API key (mm_ prefix), issued by POST /user/application/api-key',
        schema: {
          type: 'string' as const,
          description: 'Application API key embedded in the path',
          example: 'mm_K7mP2xQ9vT4yR8wN3bV6cL1aS5dF0gH7jK9mN2pQ4',
        },
      },
    ],
    requestBody: {
      description: 'SNS message to publish',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['message'],
            properties: {
              message: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 20000,
                description: 'Message body published to the configured SNS topic',
                example: 'Order #1234 has shipped.',
              },
              subject: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 100,
                description: 'Optional subject used for email-protocol SNS subscriptions',
                example: 'Order shipped',
              },
            },
          },
          examples: {
            'message-only': {
              summary: 'Publish without subject',
              value: {
                message: 'Order #1234 has shipped.',
              },
            },
            'with-subject': {
              summary: 'Publish with email subject',
              value: {
                subject: 'Order shipped',
                message: 'Order #1234 has shipped. Track it at https://example.com/track/1234.',
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'SNS message published',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['message', 'messageId'],
              properties: {
                message: {
                  type: 'string' as const,
                  description: 'Human-readable delivery confirmation',
                  example: 'The message was published successfully.',
                },
                messageId: {
                  type: 'string' as const,
                  description: 'SNS message ID returned by the Publish call',
                  example: '95df01b4-ee98-5cb9-9903-4c221d41eb5e',
                },
              },
            },
            examples: {
              published: {
                summary: 'Message accepted by SNS',
                value: {
                  message: 'The message was published successfully.',
                  messageId: '95df01b4-ee98-5cb9-9903-4c221d41eb5e',
                },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request - validation failed or key is not linked to an SNS access-key application',
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
                      example: 'The API key is not connected to an Amazon SNS access-key application.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': {
        description: 'Unauthorized - API key missing, invalid, or expired',
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
                      example: 'The API key is invalid or expired.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '500': {
        description: 'Internal server error during SNS publish',
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
  };

  protected async handleRequest(request: SendSNSRequest, _env: SendSNSEnv, _cxt: RouteContext<SendSNSEnv>): Promise<SendSNSResponse> {
    if (
      request.application.providerId !== PROVIDER_AMAZON_SNS ||
      request.application.connectionMethod !== CONNECTION_METHOD_ACCESS_KEYS ||
      request.application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED
    ) {
      throw new BadRequestError('The API key is not connected to an Amazon SNS access-key application.');
    }
    const credentials: AccessKeyCredentials = request.application.credentials as AccessKeyCredentials;
    const messageId: string = await SnsDeliveryUtil.publish(
      credentials.accessKeyId,
      credentials.secretAccessKey,
      credentials.topicArn,
      request.message,
      request.subject,
    );
    return {
      message: 'The message was published successfully.',
      messageId,
    };
  }
}

interface SendSNSRequest extends IPublicApplicationRequest {
  message: string;
  subject?: string;
}

interface SendSNSResponse extends IResponse {
  message: string;
  messageId: string;
}

type SendSNSEnv = IPublicApplicationEnv;

export { SendSNSRoute };
