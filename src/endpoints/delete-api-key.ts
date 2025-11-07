import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO, ApiKeyDAO } from '@/dao';
import { comparePassword } from '@/utils';
import { BadRequestError } from '@/error';

interface DeleteApiKeyRequest extends IRequest {
  email: string;
  password: string;
  api_key: string;
}

interface DeleteApiKeyResponse extends IResponse {
  success: boolean;
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DeleteApiKeyEnv extends IEnv {
  DB: D1Database;
}

export class DeleteApiKey extends IAPIRoute<DeleteApiKeyRequest, DeleteApiKeyResponse, DeleteApiKeyEnv> {
  schema = {
    tags: ['API Key'],
    summary: 'Delete API key',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            properties: {
              email: { type: 'string' as const, format: 'email' as const },
              password: { type: 'string' as const },
              api_key: { type: 'string' as const },
            },
            required: ['email', 'password', 'api_key'],
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'API key deleted successfully',
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
    request: DeleteApiKeyRequest,
    env: DeleteApiKeyEnv,
    _ctx: APIContext<DeleteApiKeyEnv>,
  ): Promise<DeleteApiKeyResponse> {
    const userDAO = new UserDAO(env.DB);
    const apiKeyDAO = new ApiKeyDAO(env.DB);

    // Find and verify user
    const user = await userDAO.findByEmail(request.email);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    const isValidPassword = await comparePassword(request.password, user.password_hash);
    if (!isValidPassword) {
      throw new BadRequestError('Invalid password');
    }

    // Find and delete API key
    const apiKeyRecord = await apiKeyDAO.findByApiKey(request.api_key);
    if (!apiKeyRecord || apiKeyRecord.user_id !== user.id) {
      throw new BadRequestError('API key not found or does not belong to user');
    }

    const deleted = await apiKeyDAO.delete(apiKeyRecord.id);
    if (!deleted) {
      throw new BadRequestError('Failed to delete API key');
    }

    return {
      success: true,
      message: 'API key deleted successfully',
    };
  }
}
