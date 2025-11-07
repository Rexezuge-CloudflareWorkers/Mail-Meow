import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

interface SendEmailRequest extends IRequest {
  to: string;
  subject: string;
  body: string;
  contentType?: 'text' | 'html';
  provider?: string;
}

interface SendEmailResponse extends IResponse {
  success: boolean;
  message: string;
}

interface SendEmailEnv extends IEnv {
  DB: D1Database;
  api_key: string;
}

export class SendEmail extends IAPIRoute<SendEmailRequest, SendEmailResponse, SendEmailEnv> {
  schema = {
    tags: ['Email'],
    summary: 'Send email using OAuth credentials',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            properties: {
              to: { type: 'string' as const, format: 'email' as const },
              subject: { type: 'string' as const },
              body: { type: 'string' as const },
              contentType: { type: 'string' as const, enum: ['text', 'html'], default: 'text' },
              provider: { type: 'string' as const, enum: ['gmail', 'microsoft_personal'], default: 'gmail' },
            },
            required: ['to', 'subject', 'body'],
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Email sent successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                success: { type: 'boolean' as const },
                message: { type: 'string' as const },
              },
            },
          },
        },
      },
    },
  };

  protected async handleRequest(request: SendEmailRequest, env: SendEmailEnv, ctx: APIContext<SendEmailEnv>): Promise<SendEmailResponse> {
    const api_key = ctx.req.param('api_key');
    const { to, subject, body, contentType = 'text', provider = 'gmail' } = request;

    const userDAO = new UserDAO(env.DB);
    const oauthDAO = new OAuthDAO(env.DB);

    // Verify API key
    const user = await userDAO.findByApiKey(api_key);
    if (!user) {
      throw new BadRequestError('Invalid API key');
    }

    // Get OAuth credentials for the specified provider
    const oauthRecord = await oauthDAO.findByUserIdAndProvider(user.id, provider);
    if (!oauthRecord) {
      throw new BadRequestError(`No OAuth credentials found for ${provider}. Please bind OAuth first.`);
    }

    // Note: This is a simplified implementation
    // In a real implementation, you would need to:
    // 1. Use the refresh_token to get a new access_token
    // 2. Use the appropriate API for each provider (Gmail API vs Microsoft Graph API)
    // 3. Handle token refresh and error cases properly

    throw new BadRequestError(
      'Email sending functionality requires additional implementation for OAuth token management and provider-specific APIs',
    );
  }
}
