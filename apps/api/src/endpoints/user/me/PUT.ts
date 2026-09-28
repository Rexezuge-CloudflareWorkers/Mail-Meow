import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { BadRequestError } from '@mail-meow/backend-errors';
import { LocaleUtil } from '@mail-meow/shared/utils';
import { createRequestScope } from '@mail-meow/backend-services/composition';

class UpdateCurrentUserRoute extends IUserRoute<UpdateCurrentUserRequest, UpdateCurrentUserResponse> {
  schema = {
    tags: ['User'],
    summary: 'Update current user preferences',
    description: 'Updates the authenticated user language preference used for SPA detection precedence.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['preferredLanguage'],
            properties: {
              preferredLanguage: {
                type: 'string' as const,
                description: 'BCP-47 language tag (en, de, fr, es, it, nl, pt, pl, ja, zh-CN, zh-TW, ko)',
                example: 'de',
              },
            },
          },
        },
      },
    },
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(request: UpdateCurrentUserRequest, env: Env, cxt: RouteContext): Promise<UpdateCurrentUserResponse> {
    if (!request.preferredLanguage || typeof request.preferredLanguage !== 'string') {
      throw new BadRequestError('preferredLanguage is required.');
    }
    if (!LocaleUtil.isSupported(request.preferredLanguage)) {
      throw new BadRequestError('Unsupported language.');
    }
    const scope = createRequestScope(env);
    // Resolved rather than read off the context, so `email` reports the
    // account's current address and the write keys on the account id — a chosen
    // language then survives an address change.
    const user = (await scope.users.upsertUser(this.getAuthenticatedUserEmailAddress(cxt))) ?? this.getAuthenticatedAccount(cxt);
    const normalized = await scope.users.updatePreferredLanguage(user, request.preferredLanguage);
    const config = scope.config;
    return {
      id: user.id,
      email: user.email,
      preferredLanguage: normalized,
      limits: {
        maxApplicationsPerUser: config.maxApplicationsPerUser,
        maxApiKeysPerApplication: config.maxApiKeysPerApplication,
        defaultApiKeyExpiryDays: config.defaultApiKeyExpiryDays,
        maxApiKeyExpiryDays: config.maxApiKeyExpiryDays,
      },
    };
  }
}

interface UpdateCurrentUserRequest extends IRequest {
  preferredLanguage: string;
}

interface UpdateCurrentUserResponse extends IResponse {
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

export { UpdateCurrentUserRoute };
