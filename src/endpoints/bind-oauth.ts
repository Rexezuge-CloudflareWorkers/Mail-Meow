import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { ApiKeyDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

interface BindOAuthRequest extends IRequest {
  provider: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}

interface BindOAuthResponse extends IResponse {
  success: boolean;
  message: string;
}

interface BindOAuthEnv extends IEnv {
  DB: D1Database;
  api_key: string;
}

export class BindOAuth extends IAPIRoute<BindOAuthRequest, BindOAuthResponse, BindOAuthEnv> {
  schema = {
    tags: ['OAuth'],
    summary: 'Bind OAuth credentials',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            properties: {
              provider: { type: 'string' as const },
              access_token: { type: 'string' as const },
              refresh_token: { type: 'string' as const },
              expires_at: { type: 'string' as const },
            },
            required: ['provider', 'access_token'],
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
    const { provider, access_token, refresh_token, expires_at } = request;

    const apiKeyDAO = new ApiKeyDAO(env.DB);
    const oauthDAO = new OAuthDAO(env.DB);

    // Verify API key
    const apiKeyRecord = await apiKeyDAO.findByApiKey(api_key);
    if (!apiKeyRecord) {
      throw new BadRequestError('Invalid API key');
    }

    // Check if OAuth already exists for this user
    const existingOAuth = await oauthDAO.findByUserId(apiKeyRecord.user_id);
    if (existingOAuth) {
      throw new BadRequestError('OAuth credentials already bound. Use PUT to update.');
    }

    // Create OAuth record
    await oauthDAO.create({
      id: crypto.randomUUID(),
      user_id: apiKeyRecord.user_id,
      provider,
      access_token,
      refresh_token,
      expires_at,
    });

    return {
      success: true,
      message: 'OAuth credentials bound successfully',
    };
  }
}
