import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { ApiKeyDAO, OAuthDAO } from '@/dao';
import { BadRequestError } from '@/error';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DeleteBoundOAuthRequest extends IRequest {}

interface DeleteBoundOAuthResponse extends IResponse {
  success: boolean;
  message: string;
}

interface DeleteBoundOAuthEnv extends IEnv {
  DB: D1Database;
  api_key: string;
}

export class DeleteBoundOAuth extends IAPIRoute<DeleteBoundOAuthRequest, DeleteBoundOAuthResponse, DeleteBoundOAuthEnv> {
  schema = {
    tags: ['OAuth'],
    summary: 'Delete OAuth credentials',
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
    _request: DeleteBoundOAuthRequest,
    env: DeleteBoundOAuthEnv,
    ctx: APIContext<DeleteBoundOAuthEnv>,
  ): Promise<DeleteBoundOAuthResponse> {
    const api_key = ctx.req.param('api_key');

    const apiKeyDAO = new ApiKeyDAO(env.DB);
    const oauthDAO = new OAuthDAO(env.DB);

    // Verify API key
    const apiKeyRecord = await apiKeyDAO.findByApiKey(api_key);
    if (!apiKeyRecord) {
      throw new BadRequestError('Invalid API key');
    }

    // Find and delete OAuth record
    const oauthRecord = await oauthDAO.findByUserId(apiKeyRecord.user_id);
    if (!oauthRecord) {
      throw new BadRequestError('No OAuth credentials found');
    }

    const deleted = await oauthDAO.delete(oauthRecord.id);
    if (!deleted) {
      throw new BadRequestError('Failed to delete OAuth credentials');
    }

    return {
      success: true,
      message: 'OAuth credentials deleted successfully',
    };
  }
}
