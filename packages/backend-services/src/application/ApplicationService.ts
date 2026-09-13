import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_ACCESS_KEYS,
} from '@mail-meow/shared/constants';
import { ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import { BadRequestError } from '@mail-meow/backend-errors';
import type {
  ConnectedApplicationCredentials,
  ConnectedApplicationMetadata,
} from '@mail-meow/shared/model';
import { BaseUrlUtil } from '@mail-meow/shared/utils';
import { ConfigurationManager } from '@mail-meow/backend-runtime/config';

interface ApplicationServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret | { get(): Promise<string> };
  MAX_APPLICATIONS_PER_USER?: string;
}

interface CreateApplicationInput {
  userEmail: string;
  displayName: string;
  providerId: string;
  connectionMethod: string;
  clientId?: string;
  clientSecret?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  topicArn?: string;
  raw: Request;
}

interface ApplicationServiceDeps {
  applicationDAO?: (masterKey: string) => Promise<ConnectedApplicationDAO>;
}

class ApplicationService {
  constructor(
    private readonly env: ApplicationServiceEnv,
    private readonly deps: ApplicationServiceDeps = {},
  ) {}

  private async getDAO(): Promise<ConnectedApplicationDAO> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    if (this.deps.applicationDAO) return this.deps.applicationDAO(masterKey);
    return new ConnectedApplicationDAO(this.env.DB, masterKey);
  }

  async createApplication(input: CreateApplicationInput): Promise<ConnectedApplicationMetadata & { oauth2RedirectUri: string }> {
    const dao = await this.getDAO();
    const maxApplications: number = ConfigurationManager.getMaxApplicationsPerUser(this.env);
    if ((await dao.countByUserEmail(input.userEmail)) >= maxApplications) {
      throw new BadRequestError(`Maximum ${maxApplications} connected applications allowed per user.`);
    }
    const credentials: ConnectedApplicationCredentials =
      input.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS
        ? {
            accessKeyId: input.accessKeyId!,
            secretAccessKey: input.secretAccessKey!,
            topicArn: input.topicArn!,
          }
        : {
            clientId: input.clientId!,
            clientSecret: input.clientSecret!,
          };
    const status: string =
      input.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS
        ? CONNECTED_APPLICATION_STATUS_CONNECTED
        : CONNECTED_APPLICATION_STATUS_DRAFT;
    const application = await dao.create(
      input.userEmail,
      input.displayName,
      input.providerId,
      input.connectionMethod,
      credentials,
      status,
    );
    return {
      ...application,
      oauth2RedirectUri: `${BaseUrlUtil.getBaseUrl(input.raw)}/api/oauth2/callback/${application.applicationId}`,
    };
  }

  async listApplications(userEmail: string): Promise<ConnectedApplicationMetadata[]> {
    const dao = await this.getDAO();
    return dao.listMetadataByUserEmail(userEmail);
  }

  async updateApplication(
    applicationId: string,
    userEmail: string,
    displayName: string,
    providerId: string,
    connectionMethod: string,
    credentials: ConnectedApplicationCredentials,
    status: string,
    raw: Request,
  ): Promise<ConnectedApplicationMetadata & { oauth2RedirectUri: string }> {
    const dao = await this.getDAO();
    const existing = await dao.getMetadataByIdForUser(applicationId, userEmail);
    if (!existing) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (existing.providerId !== providerId || existing.connectionMethod !== connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }
    const updated = await dao.updateForUser(applicationId, userEmail, displayName, credentials, status);
    if (!updated) throw new BadRequestError('Connected application was not found.');
    return {
      ...updated,
      oauth2RedirectUri: `${BaseUrlUtil.getBaseUrl(raw)}/api/oauth2/callback/${updated.applicationId}`,
    };
  }

  async deleteApplication(applicationId: string, userEmail: string): Promise<void> {
    const dao = await this.getDAO();
    await dao.deleteForUser(applicationId, userEmail);
  }
}

export { ApplicationService };
export type { ApplicationServiceEnv, ApplicationServiceDeps, CreateApplicationInput };
