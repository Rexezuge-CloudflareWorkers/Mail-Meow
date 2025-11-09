import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

interface DeleteBoundOAuthRequest extends IRequest {
  provider: string;
}

interface DeleteBoundOAuthResponse extends IResponse {
  success: boolean;
  message: string;
}

interface DeleteBoundOAuthEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export class DeleteBoundOAuth extends IAPIRoute<DeleteBoundOAuthRequest, DeleteBoundOAuthResponse, DeleteBoundOAuthEnv> {
  schema = {
    tags: ['OAuth'],
    summary: 'Delete OAuth credentials',
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
            },
            required: ['provider'],
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'OAuth credentials deleted successfully',
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
    request: DeleteBoundOAuthRequest,
    env: DeleteBoundOAuthEnv,
    ctx: APIContext<DeleteBoundOAuthEnv>,
  ): Promise<DeleteBoundOAuthResponse> {
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

    // Delete OAuth record for specific provider
    const deleted = await oauthDAO.deleteByUserIdAndProvider(user.id, provider);
    if (!deleted) {
      throw new BadRequestError('No OAuth credentials found for this provider');
    }

    return {
      success: true,
      message: 'OAuth credentials deleted successfully',
    };
  }
}
