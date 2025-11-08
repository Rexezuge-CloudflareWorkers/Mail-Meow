import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, OAuthDAO } from '@/dao';
import { BadRequestError, InternalServerError } from '@/error';

interface SendEmailRequest extends IRequest {
  to: string;
  subject: string;
  text: string;
}

interface SendEmailResponse extends IResponse {
  message: string;
}

interface SendEmailEnv extends IEnv {
  DB: D1Database;
}

export class SendEmail extends IAPIRoute<SendEmailRequest, SendEmailResponse, SendEmailEnv> {
  schema = {
    tags: ['Email'],
    summary: "Send an email using user's OAuth credentials",
    parameters: [
      {
        name: 'api_key',
        in: 'path' as const,
        required: true,
        schema: { type: 'string' as const },
        description: "User's API Key",
      },
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            properties: {
              to: { type: 'string' as const, format: 'email' as const },
              subject: { type: 'string' as const },
              text: { type: 'string' as const },
            },
            required: ['to', 'subject', 'text'],
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'The email was sent successfully.',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
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
    if (!api_key) {
      throw new BadRequestError('API key is required');
    }

    const { to, subject, text } = request;

    const userDAO = new UserDAO(env.DB);
    const oauthDAO = new OAuthDAO(env.DB);

    // Get user by API key
    const user = await userDAO.findByApiKey(api_key);
    if (!user) {
      throw new BadRequestError('Invalid API key');
    }

    const senderEmail = user.email;

    // Get OAuth credentials (get the first available provider)
    const oauthRecords = await oauthDAO.findByUserId(user.id);
    if (!oauthRecords || oauthRecords.length === 0) {
      throw new BadRequestError('OAuth credentials not found');
    }

    const oauthRecord = oauthRecords[0]; // Use the first available OAuth provider
    const { provider, client_id, client_secret, refresh_token } = oauthRecord;

    try {
      // Get Access Token
      const accessToken = await getAccessToken(provider, client_id, client_secret, refresh_token);

      // Send email
      await sendEmail(senderEmail, to, subject, text, accessToken, provider);

      return { message: 'The email was sent successfully.' };
    } catch (error) {
      throw new InternalServerError(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Get OAuth Access Token
async function getAccessToken(provider: string, client_id: string, client_secret: string, refresh_token: string): Promise<string> {
  try {
    let tokenUrl: string;
    let requestData: URLSearchParams;

    if (provider === 'gmail') {
      tokenUrl = 'https://oauth2.googleapis.com/token';
      requestData = new URLSearchParams({
        client_id,
        client_secret,
        grant_type: 'refresh_token',
        refresh_token,
      });
    } else if (provider === 'microsoft_personal') {
      tokenUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
      requestData = new URLSearchParams({
        client_id,
        client_secret,
        grant_type: 'refresh_token',
        refresh_token,
        scope: 'https://graph.microsoft.com/Mail.Send offline_access',
      });
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: requestData,
    });

    const data = (await response.json()) as { access_token?: string; error?: string };
    if (!response.ok || !data.access_token) {
      throw new Error(`Failed to get access token: ${data.error || 'Unknown error'}`);
    }

    return data.access_token;
  } catch (error) {
    throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Send email
async function sendEmail(from: string, to: string, subject: string, body: string, accessToken: string, provider: string): Promise<void> {
  try {
    if (provider === 'gmail') {
      // Gmail API
      const emailContent = createEmail(from, to, subject, body);
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: emailContent }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gmail API error: ${error}`);
      }
    } else if (provider === 'microsoft_personal') {
      // Microsoft Graph API
      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'Text', content: body },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Microsoft Graph API error: ${error}`);
      }
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    throw new Error(`Email sending failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Create Gmail email format
function createEmail(sender: string, recipient: string, subject: string, body: string): string {
  const email = [
    `From: ${sender}`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  // Use btoa for base64 encoding in Cloudflare Workers
  return btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
