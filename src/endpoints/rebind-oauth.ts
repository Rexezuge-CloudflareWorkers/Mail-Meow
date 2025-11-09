import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

interface RebindOAuthRequest extends IRequest {
  provider: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

interface RebindOAuthResponse extends IResponse {
  success: boolean;
  message: string;
}

interface RebindOAuthEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export class RebindOAuth extends IAPIRoute<RebindOAuthRequest, RebindOAuthResponse, RebindOAuthEnv> {
  schema = {
    tags: ['OAuth'],
    summary: 'Update OAuth credentials',
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
      '200': {
        description: 'OAuth credentials updated successfully',
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

  protected async handleRequest(
    request: RebindOAuthRequest,
    env: RebindOAuthEnv,
    ctx: APIContext<RebindOAuthEnv>,
  ): Promise<RebindOAuthResponse> {
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

    // Find existing OAuth record
    const existingOAuth = await oauthDAO.findByUserIdAndProvider(user.id, provider);
    if (!existingOAuth) {
      throw new BadRequestError('No OAuth credentials found for this provider. Use POST to create.');
    }

    // Update OAuth record
    const updated = await oauthDAO.update(existingOAuth.id, {
      provider,
      client_id,
      client_secret,
      refresh_token,
    });

    if (!updated) {
      throw new BadRequestError('Failed to update OAuth credentials');
    }

    return {
      success: true,
      message: 'OAuth credentials updated successfully',
    };
  }
}
