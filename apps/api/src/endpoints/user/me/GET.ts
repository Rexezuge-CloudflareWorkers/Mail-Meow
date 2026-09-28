import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { createRequestScope } from '@mail-meow/backend-services/composition';

class GetCurrentUserRoute extends IUserRoute<GetCurrentUserRequest, GetCurrentUserResponse> {
  schema = {
    tags: ['User'],
    summary: 'Get current user',
    description:
      'Returns the authenticated account: its stable id and the email address it currently signs in with, along with the effective tenant limits (max applications, max API keys, API key expiry bounds). Useful for rendering user context and client-side validation hints in the management UI. The id, not the address, is the account identity — the address can change without affecting the applications, API keys, and task runs attached to the account.',
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(_request: GetCurrentUserRequest, env: Env, cxt: RouteContext): Promise<GetCurrentUserResponse> {
    const scope = createRequestScope(env);
    const config = scope.config;
    // Resolved, not just read from the context: `email` must be the account's
    // *current* address, which is `users.current_email` and not necessarily the
    // one Access asserted on this request.
    const user = (await scope.users.upsertUser(this.getAuthenticatedUserEmailAddress(cxt))) ?? this.getAuthenticatedAccount(cxt);
    return {
      id: user.id,
      email: user.email,
      preferredLanguage: await scope.users.getPreferredLanguage(user),
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
  /**
  The stable account id.
  */
  id: string;
  /**
  The address the account currently signs in with.
  */
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
