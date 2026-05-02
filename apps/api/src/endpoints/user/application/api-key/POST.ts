import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  DEFAULT_DEFAULT_API_KEY_EXPIRY_DAYS,
  DEFAULT_MAX_API_KEY_EXPIRY_DAYS,
  DEFAULT_MAX_API_KEYS_PER_APPLICATION,
} from '@mail-meow/shared/constants';
import { ApplicationApiKeyDAO, ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationApiKeyMetadata, ConnectedApplicationMetadata } from '@mail-meow/shared/model';
import { ApiKeyUtil, ConfigurationUtil, TimestampUtil } from '@/utils';

class CreateApplicationApiKeyRoute extends IUserRoute<
  CreateApplicationApiKeyRequest,
  CreateApplicationApiKeyResponse,
  CreateApplicationApiKeyEnv
> {
  schema = {
    tags: ['API Keys'],
    summary: 'Create application API key',
    responses: {
      '200': {
        description: 'Application API key created',
      },
    },
  };

  protected async handleRequest(
    request: CreateApplicationApiKeyRequest,
    env: CreateApplicationApiKeyEnv,
    cxt: RouteContext<CreateApplicationApiKeyEnv>,
  ): Promise<CreateApplicationApiKeyResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(
      request.applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('Connected application must be connected before API keys can be created.');
    }

    const maxKeys: number = ConfigurationUtil.getPositiveInteger(env.MAX_API_KEYS_PER_APPLICATION, DEFAULT_MAX_API_KEYS_PER_APPLICATION);
    const apiKeyDAO: ApplicationApiKeyDAO = new ApplicationApiKeyDAO(env.DB);
    if ((await apiKeyDAO.countByApplication(request.applicationId)) >= maxKeys) {
      throw new BadRequestError(`Maximum ${maxKeys} API keys allowed per connected application.`);
    }

    const defaultExpiryDays: number = ConfigurationUtil.getPositiveInteger(
      env.DEFAULT_API_KEY_EXPIRY_DAYS,
      DEFAULT_DEFAULT_API_KEY_EXPIRY_DAYS,
    );
    const maxExpiryDays: number = ConfigurationUtil.getPositiveInteger(env.MAX_API_KEY_EXPIRY_DAYS, DEFAULT_MAX_API_KEY_EXPIRY_DAYS);
    const expiresInDays: number = request.expiresInDays ?? defaultExpiryDays;
    if (expiresInDays > maxExpiryDays) {
      throw new BadRequestError(`API key expiry cannot exceed ${maxExpiryDays} days.`);
    }

    const apiKey: string = ApiKeyUtil.generateApiKey();
    const expiresAt: number = TimestampUtil.addDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), expiresInDays);
    const metadata: ApplicationApiKeyMetadata = await apiKeyDAO.create(
      request.applicationId,
      await ApiKeyUtil.hashApiKey(apiKey),
      request.name,
      ApiKeyUtil.getPrefix(apiKey),
      ApiKeyUtil.getLastFour(apiKey),
      expiresAt,
    );
    return {
      apiKey,
      metadata,
    };
  }
}

interface CreateApplicationApiKeyRequest extends IRequest {
  applicationId: string;
  name: string;
  expiresInDays?: number | undefined;
}

interface CreateApplicationApiKeyResponse extends IResponse {
  apiKey: string;
  metadata: ApplicationApiKeyMetadata;
}

interface CreateApplicationApiKeyEnv extends IUserEnv {
  MAX_API_KEYS_PER_APPLICATION?: string | undefined;
  DEFAULT_API_KEY_EXPIRY_DAYS?: string | undefined;
  MAX_API_KEY_EXPIRY_DAYS?: string | undefined;
}

export { CreateApplicationApiKeyRoute };
