import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO } from '@/dao';
import { comparePassword } from '@/utils';
import { BadRequestError } from '@/error';

interface DeleteApiKeyRequest extends IRequest {
  email: string;
  password: string;
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
            },
            required: ['email', 'password'],
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

    // Find and verify user
    const user = await userDAO.findByEmail(request.email);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    const isValidPassword = await comparePassword(request.password, user.hashed_password);
    if (!isValidPassword) {
      throw new BadRequestError('Invalid password');
    }

    if (!user.api_key) {
      throw new BadRequestError('No API key found for user');
    }

    // Clear API key
    const deleted = await userDAO.clearApiKey(user.id);
    if (!deleted) {
      throw new BadRequestError('Failed to delete API key');
    }

    return {
      success: true,
      message: 'API key deleted successfully',
    };
  }
}
