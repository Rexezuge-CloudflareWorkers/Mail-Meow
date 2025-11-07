import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { ApiKeyDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';
import axios from 'axios';

interface SendEmailRequest extends IRequest {
  to: string;
  subject: string;
  body: string;
  contentType?: 'text' | 'html';
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
    const { to, subject, body, contentType = 'text' } = request;

    const apiKeyDAO = new ApiKeyDAO(env.DB);
    const oauthDAO = new OAuthDAO(env.DB);

    // Verify API key
    const apiKeyRecord = await apiKeyDAO.findByApiKey(api_key);
    if (!apiKeyRecord) {
      throw new BadRequestError('Invalid API key');
    }

    // Get OAuth credentials
    const oauthRecord = await oauthDAO.findByUserId(apiKeyRecord.user_id);
    if (!oauthRecord) {
      throw new BadRequestError('No OAuth credentials found. Please bind OAuth first.');
    }

    // Send email using Microsoft Graph API
    try {
      const emailData = {
        message: {
          subject: subject,
          body: {
            contentType: contentType === 'html' ? 'HTML' : 'Text',
            content: body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
      };

      await axios.post('https://graph.microsoft.com/v1.0/me/sendMail', emailData, {
        headers: {
          Authorization: `Bearer ${oauthRecord.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        success: true,
        message: 'Email sent successfully',
      };
    } catch (error: any) {
      console.error('Email sending failed:', error.response?.data || error.message);
      throw new BadRequestError('Failed to send email. Please check your OAuth credentials.');
    }
  }
}
