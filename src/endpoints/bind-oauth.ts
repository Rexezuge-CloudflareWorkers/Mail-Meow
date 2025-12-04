import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

interface BindOAuthRequest extends IRequest {
  provider: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  access_key_id?: string;
  secret_access_key?: string;
  topic_arn?: string;
}

interface BindOAuthResponse extends IResponse {
  success: boolean;
  message: string;
}

interface BindOAuthEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export class BindOAuth extends IAPIRoute<BindOAuthRequest, BindOAuthResponse, BindOAuthEnv> {
  schema = {
    tags: ['OAuth'],
    summary: 'Bind OAuth credentials or SNS credentials',
    parameters: [
      {
        name: 'api_key',
        in: 'path' as const,
        required: true,
        schema: { type: 'string' as const },
        description: 'API key for authentication',
      },
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            properties: {
              provider: { type: 'string' as const },
              client_id: { type: 'string' as const },
              client_secret: { type: 'string' as const },
              refresh_token: { type: 'string' as const },
              access_key_id: { type: 'string' as const },
              secret_access_key: { type: 'string' as const },
              topic_arn: { type: 'string' as const },
            },
            required: ['provider'],
          },
        },
      },
    },
    responses: {
      '201': {
        description: 'Credentials bound successfully',
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

  protected async handleRequest(request: BindOAuthRequest, env: BindOAuthEnv, ctx: APIContext<BindOAuthEnv>): Promise<BindOAuthResponse> {
    const api_key = ctx.req.param('api_key');
    const { provider } = request;

    const userDAO = new UserDAO(env.DB);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const oauthDAO = new OAuthDAO(env.DB, masterKey);

    // Verify API key
    const user = await userDAO.findByApiKey(api_key);
    if (!user) {
      throw new BadRequestError('Invalid API key');
    }

    // Check if OAuth already exists for this user and provider
    const existingOAuth = await oauthDAO.findByUserIdAndProvider(user.id, provider);
    if (existingOAuth) {
      throw new BadRequestError('Credentials already bound for this provider. Use PUT to update.');
    }

    // Validate and create credentials based on provider
    if (provider === 'amazon-sns') {
      const { access_key_id, secret_access_key, topic_arn } = request;
      if (!access_key_id || !secret_access_key || !topic_arn) {
        throw new BadRequestError('access_key_id, secret_access_key, and topic_arn are required for amazon-sns provider');
      }

      await oauthDAO.create({
        user_id: user.id,
        provider,
        access_key_id,
        secret_access_key,
        topic_arn,
      });
    } else {
      const { client_id, client_secret, refresh_token } = request;
      if (!client_id || !client_secret || !refresh_token) {
        throw new BadRequestError('client_id, client_secret, and refresh_token are required for OAuth providers');
      }

      await oauthDAO.create({
        user_id: user.id,
        provider,
        client_id,
        client_secret,
        refresh_token,
      });
    }

    return {
      success: true,
      message: 'Credentials bound successfully',
    };
  }
}
