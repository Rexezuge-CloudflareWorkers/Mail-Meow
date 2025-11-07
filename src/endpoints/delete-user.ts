import { IAPIRoute, IRequest, IResponse, IEnv, APIContext } from './IAPIRoute';
import { UserDAO } from '@/dao';
import { comparePassword } from '@/utils';
import { BadRequestError } from '@/error';

interface DeleteUserRequest extends IRequest {
  email: string;
  password: string;
}

interface DeleteUserResponse extends IResponse {
  success: boolean;
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DeleteUserEnv extends IEnv {
  DB: D1Database;
}

export class DeleteUser extends IAPIRoute<DeleteUserRequest, DeleteUserResponse, DeleteUserEnv> {
  schema = {
    tags: ['User'],
    summary: 'Delete user account',
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
        description: 'User deleted successfully',
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
    request: DeleteUserRequest,
    env: DeleteUserEnv,
    _ctx: APIContext<DeleteUserEnv>,
  ): Promise<DeleteUserResponse> {
    const userDAO = new UserDAO(env.DB);

    // Find user
    const user = await userDAO.findByEmail(request.email);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    // Verify password
    const isValidPassword = await comparePassword(request.password, user.hashed_password);
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
