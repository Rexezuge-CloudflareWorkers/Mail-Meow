import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, OAuthDAO } from '@/dao';
import { BadRequestError, InternalServerError } from '@/error';
import { AwsClient } from 'aws4fetch';

interface SendEmailRequest extends IRequest {
  to?: string;
  subject: string;
  text: string;
}

interface SendEmailResponse extends IResponse {
  message: string;
  messageId?: string;
}

interface SendEmailEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export class SendEmail extends IAPIRoute<SendEmailRequest, SendEmailResponse, SendEmailEnv> {
  schema = {
    tags: ['Email'],
    summary: "Send an email using user's OAuth credentials or publish to SNS",
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
            required: ['subject', 'text'],
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'The email was sent or message was published successfully.',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                message: { type: 'string' as const },
                messageId: { type: 'string' as const },
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
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const oauthDAO = new OAuthDAO(env.DB, masterKey);

    // Get user by API key
    const user = await userDAO.findByApiKey(api_key);
    if (!user) {
      throw new BadRequestError('Invalid API key');
    }

    // Check for SNS credentials first
    const snsCredentials = await oauthDAO.getDecryptedSNS(user.id);
    if (snsCredentials) {
      try {
        const { access_key_id, secret_access_key, topic_arn } = snsCredentials;
        const messageId = await publishToSNS(access_key_id, secret_access_key, topic_arn, text, subject);
        return {
          message: 'The message was published to SNS successfully.',
          messageId,
        };
      } catch (error) {
        throw new InternalServerError(`Failed to publish to SNS: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Fall back to email if no SNS credentials
    if (!to) {
      throw new BadRequestError('to field is required for email sending');
    }

    const senderEmail: string = user.email;

    // Get OAuth credentials (get the first available provider)
    const oauthRecords = await oauthDAO.findByUserId(user.id);
    if (!oauthRecords || oauthRecords.length === 0) {
      throw new BadRequestError('No credentials found. Please bind OAuth or SNS credentials first.');
    }

    const oauthRecord = oauthRecords[0]; // Use the first available OAuth provider

    // Decrypt OAuth credentials
    const decryptedOAuth = await oauthDAO.getDecryptedOAuth(user.id, oauthRecord.provider);
    if (!decryptedOAuth) {
      throw new BadRequestError('Failed to decrypt OAuth credentials');
    }

    const { client_id, client_secret, refresh_token } = decryptedOAuth;
    const provider = oauthRecord.provider;

    try {
      // Get Access Token
      const tokenResult = await getAccessToken(provider, client_id, client_secret, refresh_token);

      // Update refresh token if Microsoft returned a new one
      if (provider === 'microsoft_personal' && tokenResult.newRefreshToken) {
        await oauthDAO.updateRefreshToken(oauthRecord.id, tokenResult.newRefreshToken);
      }

      // Send email
      const originUrl: string = new URL(request.raw.url).origin; // https://example.com
      const unsubscribeUrl: string = getUnsubscribeUrl(originUrl);
      const _processedBody: string = text + getFooter(unsubscribeUrl);
      await sendEmail(senderEmail, to, subject, text, tokenResult.accessToken, provider);

      return { message: 'The email was sent successfully.' };
    } catch (error) {
      throw new InternalServerError(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

async function publishToSNS(
  accessKeyId: string,
  secretAccessKey: string,
  topicArn: string,
  message: string,
  subject?: string,
): Promise<string> {
  const region = topicArn.split(':')[3];
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: 'sns',
  });

  const params = new URLSearchParams({
    Action: 'Publish',
    TopicArn: topicArn,
    Message: message,
    Version: '2010-03-31',
  });

  if (subject) {
    params.append('Subject', subject);
  }

  const url = `https://sns.${region}.amazonaws.com/`;
  const response = await client.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SNS API error: ${response.status} ${errorText}`);
  }

  const responseText = await response.text();
  const messageIdMatch = responseText.match(/<MessageId>([^<]+)<\/MessageId>/);
  const messageId = messageIdMatch ? messageIdMatch[1] : 'unknown';

  return messageId;
}

// Get OAuth Access Token
async function getAccessToken(
  provider: string,
  client_id: string,
  client_secret: string,
  refresh_token: string,
): Promise<{ accessToken: string; newRefreshToken?: string }> {
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

    const data = (await response.json()) as { access_token?: string; refresh_token?: string; error?: string };
    if (!response.ok || !data.access_token) {
      throw new Error(`Failed to get access token: ${data.error || 'Unknown error'}`);
    }

    return {
      accessToken: data.access_token,
      newRefreshToken: data.refresh_token,
    };
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

function getFooter(unsubscribeUrl: string): string {
  return [
    '',
    '-----',
    '',
    'You are receiving this email because a request submitted through our platform triggered an email delivery action, or you previously authorized this application to send notifications on your behalf.',
    '',
    'If you believe this message was sent in error, please disregard it and review your account activity.',
    '',
    'This email is for informational purposes only and does not constitute any form of legal commitment or service guarantee. The platform is not responsible for losses caused by delays, errors, or security issues in email transmission.',
    '',
    'To stop receiving similar messages, please unsubscribe using the link below:',
    unsubscribeUrl,
  ].join('\r\n');
}

function getUnsubscribeUrl(originUrl: string) {
  return originUrl + '/unsubscribe';
}
