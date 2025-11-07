import { OpenAPIRoute } from 'chanfana';
import { UserDAO, ApiKeyDAO } from '@/dao';
import { comparePassword, generateApiKey } from '@/utils';
import { BadRequestError } from '@/error';

export class GenerateApiKey extends OpenAPIRoute {
  schema = {
    tags: ['API Key'],
    summary: 'Generate API key for user',
    request: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string' },
              },
              required: ['email', 'password'],
            },
          },
        },
      },
    },
    responses: {
      '201': {
        description: 'API key generated successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                result: {
                  type: 'object',
                  properties: {
                    api_key: { type: 'string' },
                    created_at: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  async handle(request: Request, env: Env, context: any, data: any) {
    const { email, password } = data.body;
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

    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyRecord = await apiKeyDAO.create({
      id: crypto.randomUUID(),
      user_id: user.id,
      api_key: apiKey,
    });

    return {
      success: true,
      result: {
        api_key: apiKeyRecord.api_key,
        created_at: apiKeyRecord.created_at,
      },
    };
  }
}
