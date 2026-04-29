import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import {
  DEFAULT_DEFAULT_API_KEY_EXPIRY_DAYS,
  DEFAULT_MAX_API_KEY_EXPIRY_DAYS,
  DEFAULT_MAX_API_KEYS_PER_APPLICATION,
  DEFAULT_MAX_APPLICATIONS_PER_USER,
} from '@/constants';
import { ConfigurationUtil } from '@/utils';

class GetCurrentUserRoute extends IUserRoute<GetCurrentUserRequest, GetCurrentUserResponse, GetCurrentUserEnv> {
  schema = {
    tags: ['User'],
    summary: 'Get current user',
    responses: {
      '200': {
        description: 'Current user metadata',
      },
    },
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
