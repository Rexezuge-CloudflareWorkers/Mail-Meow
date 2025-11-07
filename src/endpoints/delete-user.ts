import { OpenAPIRoute } from 'chanfana';
import { UserDAO } from '@/dao';
import { comparePassword } from '@/utils';
import { BadRequestError } from '@/error';

export class DeleteUser extends OpenAPIRoute {
  schema = {
    tags: ['User'],
    summary: 'Delete user account',
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
      '200': {
        description: 'User deleted successfully',
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
    const { email, password } = data.body;
    const userDAO = new UserDAO(env.DB);

    // Find user
    const user = await userDAO.findByEmail(email);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new BadRequestError('Invalid password');
    }

    // Delete user
    const deleted = await userDAO.delete(user.id);
    if (!deleted) {
      throw new BadRequestError('Failed to delete user');
    }

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }
}
