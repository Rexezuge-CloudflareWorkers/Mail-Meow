import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';

class DeleteApplicationRoute extends IUserRoute<DeleteApplicationRequest, DeleteApplicationResponse> {
  schema = {
    tags: ['Applications'],
    summary: 'Delete connected application',
    description:
      'Deletes a connected application owned by the authenticated user, including its API keys, OAuth2 sessions, and encrypted credentials. This operation cannot be undone. Note: the applicationId is sent as a JSON body on this DELETE request.',
    requestBody: {
      description: 'Application to delete',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['applicationId'],
            properties: {
              applicationId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the application to delete',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
            },
          },
          examples: {
            'delete-application': {
              summary: 'Delete an application',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
              },
            },
          },
        },
      },
    },
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(request: DeleteApplicationRequest, env: Env, cxt: RouteContext): Promise<DeleteApplicationResponse> {
    const scope = createRequestScope(env);
    await scope.applications.deleteApplication(request.applicationId, this.getAuthenticatedAccount(cxt));
    return { success: true };
  }
}

interface DeleteApplicationRequest extends IRequest {
  applicationId: string;
}

interface DeleteApplicationResponse extends IResponse {
  success: boolean;
}

export { DeleteApplicationRoute };
