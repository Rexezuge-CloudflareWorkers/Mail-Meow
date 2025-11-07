import { OpenAPIRoute } from 'chanfana';
import { ApiKeyDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';
import axios from 'axios';

export class SendEmail extends OpenAPIRoute {
  schema = {
    tags: ['Email'],
    summary: 'Send email using OAuth credentials',
    request: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                to: { type: 'string', format: 'email' },
                subject: { type: 'string' },
                body: { type: 'string' },
                contentType: { type: 'string', enum: ['text', 'html'], default: 'text' },
              },
              required: ['to', 'subject', 'body'],
            },
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
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };

  async handle(request: Request, env: Env, context: any, data: any) {
    const { api_key } = data.params;
    const { to, subject, body, contentType = 'text' } = data.body;

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

      const response = await axios.post('https://graph.microsoft.com/v1.0/me/sendMail', emailData, {
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
