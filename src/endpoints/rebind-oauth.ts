import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { ApiKeyDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

interface RebindOAuthRequest extends IRequest {
  provider: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}

interface RebindOAuthResponse extends IResponse {
  success: boolean;
  message: string;
}

interface RebindOAuthEnv extends IEnv {
  DB: D1Database;
  api_key: string;
}

export class RebindOAuth extends IAPIRoute<RebindOAuthRequest, RebindOAuthResponse, RebindOAuthEnv> {
  schema = {
    tags: ['OAuth'],
    summary: 'Update OAuth credentials',
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
    const { provider, access_token, refresh_token, expires_at } = request;

    const apiKeyDAO = new ApiKeyDAO(env.DB);
    const oauthDAO = new OAuthDAO(env.DB);

    // Verify API key
    const apiKeyRecord = await apiKeyDAO.findByApiKey(api_key);
    if (!apiKeyRecord) {
      throw new BadRequestError('Invalid API key');
    }

    // Find existing OAuth record
    const existingOAuth = await oauthDAO.findByUserId(apiKeyRecord.user_id);
    if (!existingOAuth) {
      throw new BadRequestError('No OAuth credentials found. Use POST to create.');
    }

    // Update OAuth record
    const updated = await oauthDAO.update(existingOAuth.id, {
      provider,
      access_token,
      refresh_token,
      expires_at,
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
