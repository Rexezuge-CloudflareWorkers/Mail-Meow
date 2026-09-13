import { ApplicationApiKeyDAO, ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import { BadRequestError, UnauthorizedError } from '@mail-meow/backend-errors';
import type { ApplicationApiKeyMetadata, ConnectedApplication } from '@mail-meow/shared/model';
import { ApiKeyUtil, TimestampUtil } from '@mail-meow/shared/utils';
import { ConfigurationManager } from '@mail-meow/backend-runtime/config';
import { CONNECTED_APPLICATION_STATUS_CONNECTED } from '@mail-meow/shared/constants';

interface ApiKeyServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret | { get(): Promise<string> };
  MAX_API_KEYS_PER_APPLICATION?: string;
  DEFAULT_API_KEY_EXPIRY_DAYS?: string;
  MAX_API_KEY_EXPIRY_DAYS?: string;
}

class ApiKeyService {
  constructor(private readonly env: ApiKeyServiceEnv) {}

  async resolveApplication(apiKey: string | undefined): Promise<ConnectedApplication> {
    if (!apiKey) {
      throw new UnauthorizedError('API key is required.');
    }
    const keyHash: string = await ApiKeyUtil.hashApiKey(apiKey);
    const apiKeyDAO = new ApplicationApiKeyDAO(this.env.DB);
    const keyMetadata: ApplicationApiKeyMetadata | undefined = await apiKeyDAO.getByHash(keyHash, true);
    if (!keyMetadata) {
      throw new UnauthorizedError('The API key is invalid or expired.');
    }
    await apiKeyDAO.updateLastUsed(keyMetadata.apiKeyId);
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getById(keyMetadata.applicationId);
    if (!application) {
      throw new UnauthorizedError('The API key is not connected to an application.');
    }
    return application;
  }

  async listApiKeys(applicationId: string, userEmail: string): Promise<ApplicationApiKeyMetadata[]> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) throw new BadRequestError('Connected application was not found.');
    const apiKeyDAO = new ApplicationApiKeyDAO(this.env.DB);
    return apiKeyDAO.listByApplication(applicationId);
  }

  async createApiKey(
    applicationId: string,
    userEmail: string,
    name: string,
    expiryDays?: number,
  ): Promise<{ metadata: ApplicationApiKeyMetadata; apiKey: string }> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) throw new BadRequestError('Connected application was not found.');
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('Connected application must be connected before API keys can be created.');
    }
    const apiKeyDAO = new ApplicationApiKeyDAO(this.env.DB);
    const maxKeys = ConfigurationManager.getMaxApiKeysPerApplication(this.env);
    if ((await apiKeyDAO.countByApplication(applicationId)) >= maxKeys) {
      throw new BadRequestError(`Maximum ${maxKeys} API keys allowed per connected application.`);
    }
    const { defaultExpiryDays, maxExpiryDays } = ConfigurationManager.getApiKeyExpiry(this.env);
    const requestedDays = expiryDays ?? defaultExpiryDays;
    if (requestedDays < 1 || requestedDays > maxExpiryDays) {
      throw new BadRequestError(`API key expiry cannot exceed ${maxExpiryDays} days.`);
    }
    const apiKey: string = ApiKeyUtil.generateApiKey();
    const expiresAt: number = TimestampUtil.addDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), requestedDays);
    const metadata = await apiKeyDAO.create(
      applicationId,
      await ApiKeyUtil.hashApiKey(apiKey),
      name,
      ApiKeyUtil.getPrefix(apiKey),
      ApiKeyUtil.getLastFour(apiKey),
      expiresAt,
    );
    return { metadata, apiKey };
  }

  async deleteApiKey(apiKeyId: string, applicationId: string, userEmail: string): Promise<void> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) throw new BadRequestError('Connected application was not found.');
    const apiKeyDAO = new ApplicationApiKeyDAO(this.env.DB);
    await apiKeyDAO.deleteForApplication(apiKeyId, applicationId);
  }
}

export { ApiKeyService };
export type { ApiKeyServiceEnv };
