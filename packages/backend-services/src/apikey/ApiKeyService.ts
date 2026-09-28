import type { ApplicationApiKeyDAO, ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import type { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { BadRequestError, UnauthorizedError } from '@mail-meow/backend-errors';
import { CONNECTED_APPLICATION_STATUS_CONNECTED } from '@mail-meow/shared/constants';
import type { AccountIdentity, ApplicationApiKeyMetadata, ConnectedApplication } from '@mail-meow/shared/model';
import { ApiKeyUtil, TimestampUtil } from '@mail-meow/shared/utils';

/**
 * Collaborators, supplied by the composition root.
 *
 * DAOs are async factories because the encrypted ones need the Secrets Store
 * master key, which is only available after an await.
 */
interface ApiKeyServiceDeps {
  applicationDAO: () => Promise<ConnectedApplicationDAO>;
  apiKeyDAO: () => Promise<ApplicationApiKeyDAO>;
  config: () => AppConfigReader;
}

class ApiKeyService {
  constructor(private readonly deps: ApiKeyServiceDeps) {}

  /**
   * Resolves the application behind a path API key.
   *
   * Every failure mode returns `UnauthorizedError` with a distinct message: a
   * caller holding an invalid key must not be able to tell "no such key" from
   * "key exists but its application is gone".
   */
  async resolveApplication(apiKey: string | undefined): Promise<ConnectedApplication> {
    if (!apiKey) {
      throw new UnauthorizedError('API key is required.');
    }
    const keyHash: string = await ApiKeyUtil.hashApiKey(apiKey);
    const apiKeyDAO: ApplicationApiKeyDAO = await this.deps.apiKeyDAO();
    const keyMetadata: ApplicationApiKeyMetadata | undefined = await apiKeyDAO.getByHash(keyHash, true);
    if (!keyMetadata) {
      throw new UnauthorizedError('The API key is invalid or expired.');
    }
    await apiKeyDAO.updateLastUsed(keyMetadata.apiKeyId);
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplication | undefined = await applicationDAO.getById(keyMetadata.applicationId);
    if (!application) {
      throw new UnauthorizedError('The API key is not connected to an application.');
    }
    return application;
  }

  async listApiKeys(applicationId: string, user: AccountIdentity): Promise<ApplicationApiKeyMetadata[]> {
    await this.requireOwnedApplication(applicationId, user);
    const apiKeyDAO: ApplicationApiKeyDAO = await this.deps.apiKeyDAO();
    return apiKeyDAO.listByApplication(applicationId);
  }

  async createApiKey(
    applicationId: string,
    user: AccountIdentity,
    name: string,
    expiryDays?: number,
  ): Promise<{ metadata: ApplicationApiKeyMetadata; apiKey: string }> {
    const application: ConnectedApplication = await this.requireOwnedApplication(applicationId, user);
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('Connected application must be connected before API keys can be created.');
    }

    const config: AppConfigReader = this.deps.config();
    const apiKeyDAO: ApplicationApiKeyDAO = await this.deps.apiKeyDAO();
    const maxKeys: number = config.maxApiKeysPerApplication;
    if ((await apiKeyDAO.countByApplication(applicationId)) >= maxKeys) {
      throw new BadRequestError(`Maximum ${maxKeys.toString()} API keys allowed per connected application.`);
    }

    const requestedDays: number = expiryDays ?? config.defaultApiKeyExpiryDays;
    if (requestedDays < 1 || requestedDays > config.maxApiKeyExpiryDays) {
      throw new BadRequestError(`API key expiry cannot exceed ${config.maxApiKeyExpiryDays.toString()} days.`);
    }

    const apiKey: string = ApiKeyUtil.generateApiKey();
    const expiresAt: number = TimestampUtil.addDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), requestedDays);
    const metadata: ApplicationApiKeyMetadata = await apiKeyDAO.create(
      applicationId,
      await ApiKeyUtil.hashApiKey(apiKey),
      name,
      ApiKeyUtil.getPrefix(apiKey),
      ApiKeyUtil.getLastFour(apiKey),
      expiresAt,
    );
    return { metadata, apiKey };
  }

  async deleteApiKey(apiKeyId: string, applicationId: string, user: AccountIdentity): Promise<void> {
    await this.requireOwnedApplication(applicationId, user);
    const apiKeyDAO: ApplicationApiKeyDAO = await this.deps.apiKeyDAO();
    await apiKeyDAO.deleteForApplication(apiKeyId, applicationId);
  }

  /**
   * Confirms the application exists *and* belongs to the caller, so every mutating
   * key operation is ownership-checked rather than relying on the DELETE's own
   * `AND application_id = ?` predicate.
   */
  private async requireOwnedApplication(applicationId: string, user: AccountIdentity): Promise<ConnectedApplication> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(applicationId, user);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return application;
  }
}

export { ApiKeyService };
export type { ApiKeyServiceDeps };
