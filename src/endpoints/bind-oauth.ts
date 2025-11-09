import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

interface BindOAuthRequest extends IRequest {
  provider: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
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
    summary: 'Bind OAuth credentials',
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
            },
            required: ['provider', 'client_id', 'client_secret', 'refresh_token'],
          },
        },
      },
    },
    responses: {
      '201': {
        description: 'OAuth credentials bound successfully',
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
    const { provider, client_id, client_secret, refresh_token } = request;

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
      throw new BadRequestError('OAuth credentials already bound for this provider. Use PUT to update.');
    }

    // Create OAuth record
    await oauthDAO.create({
      user_id: user.id,
      provider,
      client_id,
      client_secret,
      refresh_token,
    });

    return {
      success: true,
      message: 'OAuth credentials bound successfully',
    };
  }
}
