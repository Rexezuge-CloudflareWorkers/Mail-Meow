import { API_KEY_SECURITY, UNAUTHORIZED_API_KEY_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { IPublicApplicationRoute } from '@/endpoints/IPublicApplicationRoute';
import type { IPublicApplicationRequest, IResponse, RouteContext } from '@/endpoints/IPublicApplicationRoute';

class SendSNSRoute extends IPublicApplicationRoute<SendSNSRequest, SendSNSResponse> {
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
                maxLength: 20_000,
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
    responses: errorResponses(UNAUTHORIZED_API_KEY_MESSAGE),
    security: API_KEY_SECURITY,
  };

  protected async handleRequest(request: SendSNSRequest, env: Env, _cxt: RouteContext): Promise<SendSNSResponse> {
    const scope = createRequestScope(env);
    const messageId: string = await scope.sns.publishForApplication(request.application, request.message, request.subject);
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

export { SendSNSRoute };
