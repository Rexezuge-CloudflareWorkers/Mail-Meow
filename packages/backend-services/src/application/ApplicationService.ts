import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_ACCESS_KEYS,
  type ConnectedApplicationStatus,
  type ConnectionMethod,
} from '@mail-meow/shared/constants';
import type { ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import type { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { BadRequestError } from '@mail-meow/backend-errors';
import type { ConnectedApplicationCredentials, ConnectedApplicationMetadata } from '@mail-meow/shared/model';
import { BaseUrlUtil } from '@mail-meow/shared/utils';

/**
An application plus the redirect URI the provider must be configured with.
*/
type ApplicationWithRedirect = ConnectedApplicationMetadata & { oauth2RedirectUri: string };

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
  applicationDAO: () => Promise<ConnectedApplicationDAO>;
  config: () => AppConfigReader;
}

class ApplicationService {
  constructor(private readonly deps: ApplicationServiceDeps) {}

  async createApplication(input: CreateApplicationInput): Promise<ApplicationWithRedirect> {
    const dao: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const maxApplications: number = this.deps.config().maxApplicationsPerUser;
    if ((await dao.countByUserEmail(input.userEmail)) >= maxApplications) {
      throw new BadRequestError(`Maximum ${maxApplications.toString()} connected applications allowed per user.`);
    }
    const connectionMethod: ConnectionMethod =
      input.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS ? CONNECTION_METHOD_ACCESS_KEYS : 'oauth2';
    const application: ConnectedApplicationMetadata = await dao.create(
      input.userEmail,
      input.displayName,
      input.providerId,
      connectionMethod,
      ApplicationService.buildCredentials(connectionMethod, input),
      // Access keys are usable the moment they are stored; OAuth2 has nothing to
      // send with until the user completes the consent flow.
      connectionMethod === CONNECTION_METHOD_ACCESS_KEYS ? CONNECTED_APPLICATION_STATUS_CONNECTED : CONNECTED_APPLICATION_STATUS_DRAFT,
    );
    return { ...application, oauth2RedirectUri: ApplicationService.buildRedirectUri(application.applicationId, input.raw) };
  }

  async listApplications(userEmail: string): Promise<ConnectedApplicationMetadata[]> {
    const dao: ConnectedApplicationDAO = await this.deps.applicationDAO();
    return dao.listMetadataByUserEmail(userEmail);
  }

  async updateApplication(
    applicationId: string,
    userEmail: string,
    displayName: string,
    providerId: string,
    connectionMethod: string,
    credentials: ConnectedApplicationCredentials,
    status: ConnectedApplicationStatus,
    raw: Request,
  ): Promise<ApplicationWithRedirect> {
    const dao: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const existing: ConnectedApplicationMetadata | undefined = await dao.getMetadataByIdForUser(applicationId, userEmail);
    if (!existing) {
      throw new BadRequestError('Connected application was not found.');
    }
    // Provider and connection method are part of the stored identity: changing
    // either would leave credentials that no longer match how they are sent.
    if (existing.providerId !== providerId || existing.connectionMethod !== connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }
    const updated: ConnectedApplicationMetadata | undefined = await dao.updateForUser(
      applicationId,
      userEmail,
      displayName,
      credentials,
      status,
    );
    if (!updated) {
      throw new BadRequestError('Connected application was not found.');
    }
    return { ...updated, oauth2RedirectUri: ApplicationService.buildRedirectUri(updated.applicationId, raw) };
  }

  async deleteApplication(applicationId: string, userEmail: string): Promise<void> {
    const dao: ConnectedApplicationDAO = await this.deps.applicationDAO();
    await dao.deleteForUser(applicationId, userEmail);
  }

  private static buildCredentials(connectionMethod: ConnectionMethod, input: CreateApplicationInput): ConnectedApplicationCredentials {
    // The request schema guarantees the matching field is present for the
    // declared connection method; these assertions narrow the optional inputs.
    if (connectionMethod === CONNECTION_METHOD_ACCESS_KEYS) {
      return {
        accessKeyId: input.accessKeyId!,
        secretAccessKey: input.secretAccessKey!,
        topicArn: input.topicArn!,
      };
    }
    return { clientId: input.clientId!, clientSecret: input.clientSecret! };
  }

  private static buildRedirectUri(applicationId: string, raw: Request): string {
    return `${BaseUrlUtil.getBaseUrl(raw)}/api/oauth2/callback/${applicationId}`;
  }
}

export { ApplicationService };
export type { ApplicationServiceDeps, ApplicationWithRedirect, CreateApplicationInput };
