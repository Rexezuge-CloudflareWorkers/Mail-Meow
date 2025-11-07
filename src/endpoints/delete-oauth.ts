import { OpenAPIRoute } from 'chanfana';
import { ApiKeyDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

export class DeleteBoundOAuth extends OpenAPIRoute {
  schema = {
    tags: ['OAuth'],
    summary: 'Delete OAuth credentials',
    responses: {
      '200': {
        description: 'OAuth credentials deleted successfully',
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

    const apiKeyDAO = new ApiKeyDAO(env.DB);
    const oauthDAO = new OAuthDAO(env.DB);

    // Verify API key
    const apiKeyRecord = await apiKeyDAO.findByApiKey(api_key);
    if (!apiKeyRecord) {
      throw new BadRequestError('Invalid API key');
    }

    // Delete OAuth record
    const deleted = await oauthDAO.delete(apiKeyRecord.user_id);
    if (!deleted) {
      throw new BadRequestError('No OAuth credentials found to delete');
    }

    return {
      success: true,
      message: 'OAuth credentials deleted successfully',
    };
  }
}
