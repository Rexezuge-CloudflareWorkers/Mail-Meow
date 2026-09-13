import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { BadRequestError } from '@mail-meow/backend-errors';
import { LocaleUtil } from '@mail-meow/shared/utils';
import { Tokens, createRequestScope } from '@mail-meow/backend-services/composition';

class UpdateCurrentUserRoute extends IUserRoute<UpdateCurrentUserRequest, UpdateCurrentUserResponse, UpdateCurrentUserEnv> {
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
    responses: {
      '200': {
        description: 'Updated user metadata',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['email', 'preferredLanguage', 'limits'],
              properties: {
                email: { type: 'string' as const, format: 'email' },
                preferredLanguage: { type: 'string' as const, description: 'Normalized language tag', example: 'de' },
                limits: {
                  type: 'object' as const,
                  required: ['maxApplicationsPerUser', 'maxApiKeysPerApplication', 'defaultApiKeyExpiryDays', 'maxApiKeyExpiryDays'],
                  properties: {
                    maxApplicationsPerUser: { type: 'number' as const },
                    maxApiKeysPerApplication: { type: 'number' as const },
                    defaultApiKeyExpiryDays: { type: 'number' as const },
                    maxApiKeyExpiryDays: { type: 'number' as const },
                  },
                },
              },
            },
          },
        },
      },
    },
    security: [{ CloudflareAccess: [] }],
  };

  protected async handleRequest(
    request: UpdateCurrentUserRequest,
    env: UpdateCurrentUserEnv,
    cxt: RouteContext<UpdateCurrentUserEnv>,
  ): Promise<UpdateCurrentUserResponse> {
    if (!request.preferredLanguage || typeof request.preferredLanguage !== 'string') {
      throw new BadRequestError('preferredLanguage is required.');
    }
    if (!LocaleUtil.isSupported(request.preferredLanguage)) {
      throw new BadRequestError('Unsupported language.');
    }
    const scope = createRequestScope(env);
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const normalized = await scope.get(Tokens.UserService).updatePreferredLanguage(userEmail, request.preferredLanguage);
    const config = scope.get(Tokens.AppConfig);
    return {
      email: userEmail,
      preferredLanguage: normalized,
      limits: {
        maxApplicationsPerUser: config.getMaxApplicationsPerUser(),
        maxApiKeysPerApplication: config.getMaxApiKeysPerApplication(),
        defaultApiKeyExpiryDays: config.getDefaultApiKeyExpiryDays(),
        maxApiKeyExpiryDays: config.getMaxApiKeyExpiryDays(),
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

type UpdateCurrentUserEnv = IUserEnv;

export { UpdateCurrentUserRoute };
