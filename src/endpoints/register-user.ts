import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO } from '@/dao';
import { hashPassword } from '@/utils';
import { BadRequestError } from '@/error';

interface RegisterUserRequest extends IRequest {
  email: string;
  password: string;
}

interface RegisterUserResponse extends IResponse {
  success: boolean;
  result: {
    email: string;
    created_at: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface RegisterUserEnv extends IEnv {
  DB: D1Database;
}

export class RegisterUser extends IAPIRoute<RegisterUserRequest, RegisterUserResponse, RegisterUserEnv> {
  schema = {
    tags: ['User'],
    summary: 'Register a new user',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            properties: {
              email: { type: 'string' as const, format: 'email' as const },
              password: { type: 'string' as const, minLength: 6 },
            },
            required: ['email', 'password'],
          },
        },
      },
    },
    responses: {
      '201': {
        description: 'User registered successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                success: { type: 'boolean' as const },
                result: {
                  type: 'object' as const,
                  properties: {
                    id: { type: 'string' as const },
                    email: { type: 'string' as const },
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
    request: RegisterUserRequest,
    env: RegisterUserEnv,
    _ctx: APIContext<RegisterUserEnv>,
  ): Promise<RegisterUserResponse> {
    const userDAO = new UserDAO(env.DB);

    // Check if user already exists
    const existingUser = await userDAO.findByEmail(request.email);
    if (existingUser) {
      throw new BadRequestError('User already exists');
    }

    // Create new user
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(request.password);

    const user = await userDAO.create({
      email: request.email,
      password: request.password,
      hashed_password: passwordHash,
    });

    return {
      success: true,
      result: {
        email: user.email,
        created_at: user.created_at,
      },
    };
  }
}
