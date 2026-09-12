import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_OAUTH2 } from '@mail-meow/shared/constants';
import { ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IPublicApplicationRoute } from '@/endpoints/IPublicApplicationRoute';
import type { IPublicApplicationEnv, IPublicApplicationRequest, IResponse, RouteContext } from '@/endpoints/IPublicApplicationRoute';
import type { OAuth2Credentials } from '@mail-meow/shared/model';
import { MailDeliveryUtil, OAuth2ProviderUtil } from '@/utils';

class SendEmailRoute extends IPublicApplicationRoute<SendEmailRequest, SendEmailResponse, SendEmailEnv> {
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
                maxLength: 20000,
                description: 'Plaintext body (required if html is omitted)',
                example: 'Hi Jane, your order #1234 has shipped.',
              },
              html: {
                type: 'string' as const,
                maxLength: 20000,
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
    responses: {
      '200': {
        description: 'Email sent',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['message'],
              properties: {
                message: {
                  type: 'string' as const,
                  description: 'Human-readable delivery confirmation',
                  example: 'The email was sent successfully.',
                },
              },
            },
            examples: {
              sent: {
                summary: 'Email accepted by the provider',
                value: { message: 'The email was sent successfully.' },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request - validation failed or key is not linked to an authorized OAuth2 email application',
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
                      example: 'The API key is not connected to an authorized OAuth2 email application.',
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
        description: 'Internal server error during email delivery',
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

  protected async handleRequest(
    request: SendEmailRequest,
    env: SendEmailEnv,
    _cxt: RouteContext<SendEmailEnv>,
  ): Promise<SendEmailResponse> {
    if (
      request.application.connectionMethod !== CONNECTION_METHOD_OAUTH2 ||
      request.application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED
    ) {
      throw new BadRequestError('The API key is not connected to an authorized OAuth2 email application.');
    }
    const credentials: OAuth2Credentials = request.application.credentials as OAuth2Credentials;
    const tokenResult = await OAuth2ProviderUtil.refreshAccessToken({
      providerId: request.application.providerId,
      credentials,
    });
    if (tokenResult.refreshToken) {
      const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
      const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
      await applicationDAO.updateOAuth2RefreshToken(request.application.applicationId, tokenResult.refreshToken);
    }
    await MailDeliveryUtil.sendEmail(
      request.application.providerId,
      request.application.userEmail,
      request.to,
      request.subject,
      { text: request.text, html: request.html },
      tokenResult.accessToken,
    );
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

type SendEmailEnv = IPublicApplicationEnv;

export { SendEmailRoute };
