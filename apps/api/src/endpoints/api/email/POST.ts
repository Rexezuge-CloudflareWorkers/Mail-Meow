import { API_KEY_SECURITY, UNAUTHORIZED_API_KEY_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';

import { IPublicApplicationRoute } from '@/endpoints/IPublicApplicationRoute';
import type { IPublicApplicationRequest, IResponse, RouteContext } from '@/endpoints/IPublicApplicationRoute';

class SendEmailRoute extends IPublicApplicationRoute<SendEmailRequest, SendEmailResponse> {
  schema = {
    tags: ['Delivery'],
    summary: 'Send email',
    description:
      'Public delivery endpoint that sends an email through the provider linked to the path API key. The key must belong to an oauth2 application (google-gmail or microsoft-outlook) with status connected. The stored refresh token is refreshed automatically (rotated when the provider returns a new one) before sending. At least one of text or html is required.',
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
      description: 'Email to send',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['to', 'subject'],
            properties: {
              to: {
                type: 'string' as const,
                format: 'email',
                maxLength: 320,
                description: 'Recipient email address',
                example: 'recipient@example.com',
              },
              subject: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 512,
                description: 'Email subject line',
                example: 'Your order has shipped',
              },
              text: {
                type: 'string' as const,
                maxLength: 20_000,
                description: 'Plaintext body (required if html is omitted)',
                example: 'Hi Jane, your order #1234 has shipped.',
              },
              html: {
                type: 'string' as const,
                maxLength: 20_000,
                description: 'HTML body (required if text is omitted)',
                example: '<p>Hi Jane, your order <strong>#1234</strong> has shipped.</p>',
              },
            },
          },
          examples: {
            'text-only': {
              summary: 'Plaintext email',
              value: {
                to: 'recipient@example.com',
                subject: 'Your order has shipped',
                text: 'Hi Jane, your order #1234 has shipped.',
              },
            },
            'html-only': {
              summary: 'HTML email',
              value: {
                to: 'recipient@example.com',
                subject: 'Your order has shipped',
                html: '<p>Hi Jane, your order <strong>#1234</strong> has shipped.</p>',
              },
            },
            'text-and-html': {
              summary: 'Multipart email with both bodies',
              value: {
                to: 'recipient@example.com',
                subject: 'Your order has shipped',
                text: 'Hi Jane, your order #1234 has shipped.',
                html: '<p>Hi Jane, your order <strong>#1234</strong> has shipped.</p>',
              },
            },
          },
        },
      },
    },
    responses: errorResponses(UNAUTHORIZED_API_KEY_MESSAGE),
    security: API_KEY_SECURITY,
  };

  protected async handleRequest(request: SendEmailRequest, env: Env, _cxt: RouteContext): Promise<SendEmailResponse> {
    const scope = createRequestScope(env);
    await scope.mailDelivery.sendEmailForApplication(request.application, request.to, request.subject, {
      text: request.text,
      html: request.html,
    });
    return { message: 'The email was sent successfully.' };
  }
}

interface SendEmailRequest extends IPublicApplicationRequest {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

interface SendEmailResponse extends IResponse {
  message: string;
}

export { SendEmailRoute };
