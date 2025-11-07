import { OpenAPIRoute } from 'chanfana';
import { UserDAO, ApiKeyDAO } from '@/dao';
import { comparePassword } from '@/utils';
import { BadRequestError } from '@/error';

export class DeleteApiKey extends OpenAPIRoute {
  schema = {
    tags: ['API Key'],
    summary: 'Delete API key',
    request: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string' },
                api_key: { type: 'string' },
              },
              required: ['email', 'password', 'api_key'],
            },
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
    const { email, password, api_key } = data.body;
    const userDAO = new UserDAO(env.DB);
    const apiKeyDAO = new ApiKeyDAO(env.DB);

    // Find and verify user
    const user = await userDAO.findByEmail(email);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new BadRequestError('Invalid password');
    }

    // Verify API key belongs to user
    const apiKeyRecord = await apiKeyDAO.findByApiKey(api_key);
    if (!apiKeyRecord || apiKeyRecord.user_id !== user.id) {
      throw new BadRequestError('API key not found or does not belong to user');
    }

    // Delete API key
    const deleted = await apiKeyDAO.delete(api_key);
    if (!deleted) {
      throw new BadRequestError('Failed to delete API key');
    }

    return {
      success: true,
      message: 'API key deleted successfully',
    };
  }
}
