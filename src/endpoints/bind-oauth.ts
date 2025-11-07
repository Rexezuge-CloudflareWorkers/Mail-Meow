import { OpenAPIRoute } from 'chanfana';
import { ApiKeyDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

export class BindOAuth extends OpenAPIRoute {
  schema = {
    tags: ['OAuth'],
    summary: 'Bind OAuth credentials',
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
              required: ['provider', 'access_token'],
            },
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
