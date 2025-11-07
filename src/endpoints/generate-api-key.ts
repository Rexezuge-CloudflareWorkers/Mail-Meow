import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO } from '@/dao';
import { comparePassword, generateApiKey } from '@/utils';
import { BadRequestError } from '@/error';

interface GenerateApiKeyRequest extends IRequest {
  email: string;
  password: string;
}

interface GenerateApiKeyResponse extends IResponse {
  success: boolean;
  result: {
    api_key: string;
    created_at: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface GenerateApiKeyEnv extends IEnv {
  DB: D1Database;
}

export class GenerateApiKey extends IAPIRoute<GenerateApiKeyRequest, GenerateApiKeyResponse, GenerateApiKeyEnv> {
  schema = {
    tags: ['API Key'],
    summary: 'Generate API key for user',
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
      '201': {
        description: 'API key generated successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                success: { type: 'boolean' as const },
                result: {
                  type: 'object' as const,
                  properties: {
                    api_key: { type: 'string' as const },
                    created_at: { type: 'string' as const },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  protected async handleRequest(
    request: GenerateApiKeyRequest,
    env: GenerateApiKeyEnv,
    _ctx: APIContext<GenerateApiKeyEnv>,
  ): Promise<GenerateApiKeyResponse> {
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

    // Generate and update API key
    const apiKey = generateApiKey();
    await userDAO.updateApiKey(user.id, apiKey);

    return {
      success: true,
      result: {
        api_key: apiKey,
        created_at: user.created_at,
      },
    };
  }
}
