import { OpenAPIRoute } from 'chanfana';
import { ApiKeyDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

export class RebindOAuth extends OpenAPIRoute {
  schema = {
    tags: ['OAuth'],
    summary: 'Update OAuth credentials',
    request: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                provider: { type: 'string' },
                access_token: { type: 'string' },
                refresh_token: { type: 'string' },
                expires_at: { type: 'string' },
              },
              required: ['access_token'],
            },
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
    const { provider, access_token, refresh_token, expires_at } = data.body;

    const apiKeyDAO = new ApiKeyDAO(env.DB);
    const oauthDAO = new OAuthDAO(env.DB);

    // Verify API key
    const apiKeyRecord = await apiKeyDAO.findByApiKey(api_key);
    if (!apiKeyRecord) {
      throw new BadRequestError('Invalid API key');
    }

    // Update OAuth record
    const updatedOAuth = await oauthDAO.update(apiKeyRecord.user_id, {
      provider,
      access_token,
      refresh_token,
      expires_at,
    });

    if (!updatedOAuth) {
      throw new BadRequestError('No OAuth credentials found to update');
    }

    return {
      success: true,
      message: 'OAuth credentials updated successfully',
    };
  }
}
