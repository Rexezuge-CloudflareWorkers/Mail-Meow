import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { createRequestScope } from '@mail-meow/backend-services/composition';

class GetCurrentUserRoute extends IUserRoute<GetCurrentUserRequest, GetCurrentUserResponse> {
  schema = {
    tags: ['User'],
    summary: 'Get current user',
    description:
      'Returns the authenticated user email address extracted from Cloudflare Access headers, along with the effective tenant limits (max applications, max API keys, API key expiry bounds). Useful for rendering user context and client-side validation hints in the management UI.',
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(_request: GetCurrentUserRequest, env: Env, cxt: RouteContext): Promise<GetCurrentUserResponse> {
    const scope = createRequestScope(env);
    const config = scope.config;
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const preferredLanguage = await scope.users.getPreferredLanguage(userEmail);
    return {
      email: userEmail,
      preferredLanguage,
      limits: {
        maxApplicationsPerUser: config.maxApplicationsPerUser,
        maxApiKeysPerApplication: config.maxApiKeysPerApplication,
        defaultApiKeyExpiryDays: config.defaultApiKeyExpiryDays,
        maxApiKeyExpiryDays: config.maxApiKeyExpiryDays,
      },
    };
  }
}

type GetCurrentUserRequest = IRequest;

interface GetCurrentUserResponse extends IResponse {
  email: string;
  preferredLanguage: string | null;
  limits: {
    maxApplicationsPerUser: number;
    maxApiKeysPerApplication: number;
    defaultApiKeyExpiryDays: number;
    maxApiKeyExpiryDays: number;
  };
}

export { GetCurrentUserRoute };
