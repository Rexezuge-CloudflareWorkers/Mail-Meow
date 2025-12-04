import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, OAuthDAO } from '@/dao';
import { BadRequestError, InternalServerError } from '@/error';
import { AwsClient } from 'aws4fetch';

interface SendSNSRequest extends IRequest {
  message: string;
  subject?: string;
}

interface SendSNSResponse extends IResponse {
  message: string;
  messageId?: string;
}

interface SendSNSEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export class SendSNS extends IAPIRoute<SendSNSRequest, SendSNSResponse, SendSNSEnv> {
  schema = {
    tags: ['SNS'],
    summary: "Publish message to SNS topic using user's AWS credentials",
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
              message: { type: 'string' as const },
              subject: { type: 'string' as const },
            },
            required: ['message'],
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'The message was published successfully.',
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

  protected async handleRequest(request: SendSNSRequest, env: SendSNSEnv, ctx: APIContext<SendSNSEnv>): Promise<SendSNSResponse> {
    const api_key = ctx.req.param('api_key');
    if (!api_key) {
      throw new BadRequestError('API key is required');
    }

    const { message, subject } = request;

    const userDAO = new UserDAO(env.DB);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const oauthDAO = new OAuthDAO(env.DB, masterKey);

    // Get user by API key
    const user = await userDAO.findByApiKey(api_key);
    if (!user) {
      throw new BadRequestError('Invalid API key');
    }

    // Get SNS credentials
    const snsCredentials = await oauthDAO.getDecryptedSNS(user.id);
    if (!snsCredentials) {
      throw new BadRequestError('SNS credentials not found');
    }

    const { access_key_id, secret_access_key, topic_arn } = snsCredentials;

    try {
      const messageId = await publishToSNS(access_key_id, secret_access_key, topic_arn, message, subject);
      return {
        message: 'The message was published successfully.',
        messageId,
      };
    } catch (error) {
      throw new InternalServerError(`Failed to publish message: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
