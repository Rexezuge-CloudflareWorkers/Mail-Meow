import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import {
  DEFAULT_DEFAULT_API_KEY_EXPIRY_DAYS,
  DEFAULT_MAX_API_KEY_EXPIRY_DAYS,
  DEFAULT_MAX_API_KEYS_PER_APPLICATION,
  DEFAULT_MAX_APPLICATIONS_PER_USER,
} from '@mail-meow/shared/constants';
import { ConfigurationUtil } from '@/utils';

class GetCurrentUserRoute extends IUserRoute<GetCurrentUserRequest, GetCurrentUserResponse, GetCurrentUserEnv> {
  schema = {
    tags: ['User'],
    summary: 'Get current user',
    description:
      'Returns the authenticated user email address extracted from Cloudflare Access headers, along with the effective tenant limits (max applications, max API keys, API key expiry bounds). Useful for rendering user context and client-side validation hints in the management UI.',
    responses: {
      '200': {
        description: 'Current user metadata',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['email', 'limits'],
              properties: {
                email: {
                  type: 'string' as const,
                  format: 'email',
                  description: 'Email address of the authenticated user as provided by Cloudflare Access',
                  example: 'user@example.com',
                },
                limits: {
                  type: 'object' as const,
                  required: ['maxApplicationsPerUser', 'maxApiKeysPerApplication', 'defaultApiKeyExpiryDays', 'maxApiKeyExpiryDays'],
                  properties: {
                    maxApplicationsPerUser: {
                      type: 'number' as const,
                      description: 'Maximum connected applications allowed per user',
                      example: 99,
                    },
                    maxApiKeysPerApplication: {
                      type: 'number' as const,
                      description: 'Maximum API keys allowed per connected application',
                      example: 5,
                    },
                    defaultApiKeyExpiryDays: {
                      type: 'number' as const,
                      description: 'Default API key expiry in days when expiresInDays is omitted',
                      example: 365,
                    },
                    maxApiKeyExpiryDays: {
                      type: 'number' as const,
                      description: 'Maximum API key expiry in days',
                      example: 365,
                    },
                  },
                },
              },
            },
            examples: {
              'current-user': {
                summary: 'Current user with effective limits',
                value: {
                  email: 'john.doe@company.com',
                  limits: {
                    maxApplicationsPerUser: 99,
                    maxApiKeysPerApplication: 5,
                    defaultApiKeyExpiryDays: 365,
                    maxApiKeyExpiryDays: 365,
                  },
                },
              },
            },
          },
        },
      },
      '401': {
        description: 'Unauthorized - Missing or invalid authentication headers',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: {
                      type: 'string' as const,
                      example: 'Unauthorized',
                    },
                    Message: {
                      type: 'string' as const,
                      description: 'Authentication error details',
                      example: 'No Cloudflare Access JWT token provided in request headers.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '500': {
        description: 'Internal server error while retrieving user information',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: {
                      type: 'string' as const,
                      example: 'InternalServerError',
                    },
                    Message: {
                      type: 'string' as const,
                      description: 'Error description',
                      example: 'The server encountered an internal error and was unable to complete your request.',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        CloudflareAccess: [],
      },
    ],
  };

  protected async handleRequest(
    _request: GetCurrentUserRequest,
    env: GetCurrentUserEnv,
    cxt: RouteContext<GetCurrentUserEnv>,
  ): Promise<GetCurrentUserResponse> {
    return {
      email: this.getAuthenticatedUserEmailAddress(cxt),
      limits: {
        maxApplicationsPerUser: ConfigurationUtil.getPositiveInteger(env.MAX_APPLICATIONS_PER_USER, DEFAULT_MAX_APPLICATIONS_PER_USER),
        maxApiKeysPerApplication: ConfigurationUtil.getPositiveInteger(
          env.MAX_API_KEYS_PER_APPLICATION,
          DEFAULT_MAX_API_KEYS_PER_APPLICATION,
        ),
        defaultApiKeyExpiryDays: ConfigurationUtil.getPositiveInteger(env.DEFAULT_API_KEY_EXPIRY_DAYS, DEFAULT_DEFAULT_API_KEY_EXPIRY_DAYS),
        maxApiKeyExpiryDays: ConfigurationUtil.getPositiveInteger(env.MAX_API_KEY_EXPIRY_DAYS, DEFAULT_MAX_API_KEY_EXPIRY_DAYS),
      },
    };
  }
}

type GetCurrentUserRequest = IRequest;

interface GetCurrentUserResponse extends IResponse {
  email: string;
  limits: {
    maxApplicationsPerUser: number;
    maxApiKeysPerApplication: number;
    defaultApiKeyExpiryDays: number;
    maxApiKeyExpiryDays: number;
  };
}

interface GetCurrentUserEnv extends IUserEnv {
  MAX_APPLICATIONS_PER_USER?: string | undefined;
  MAX_API_KEYS_PER_APPLICATION?: string | undefined;
  DEFAULT_API_KEY_EXPIRY_DAYS?: string | undefined;
  MAX_API_KEY_EXPIRY_DAYS?: string | undefined;
}

export { GetCurrentUserRoute };
