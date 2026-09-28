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
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const normalized = await scope.users.updatePreferredLanguage(userEmail, request.preferredLanguage);
    const config = scope.config;
    return {
      email: userEmail,
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
