import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';
import { UserDAO } from '@/dao';
import { hashPassword } from '@/utils';
import { BadRequestError } from '@/error';

export class RegisterUser extends OpenAPIRoute {
  schema = {
    tags: ['User'],
    summary: 'Register a new user',
    request: {
      body: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 6 },
              },
              required: ['email', 'password'],
            },
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
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                result: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
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

    // Check if user already exists
    const existingUser = await userDAO.findByEmail(email);
    if (existingUser) {
      throw new BadRequestError('User already exists');
    }

    // Create new user
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    const user = await userDAO.create({
      id: userId,
      email,
      password: password,
      password_hash: passwordHash,
    });

    return {
      success: true,
      result: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
    };
  }
}
