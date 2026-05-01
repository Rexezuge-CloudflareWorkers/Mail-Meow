import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_ACCESS_KEYS,
  DEFAULT_MAX_APPLICATIONS_PER_USER,
} from '@mail-meow/shared/constants';
import { ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationCredentials, ConnectedApplicationMetadata } from '@mail-meow/shared/model';
import { ConfigurationUtil, BaseUrlUtil } from '@/utils';

class CreateApplicationRoute extends IUserRoute<CreateApplicationRequest, CreateApplicationResponse, CreateApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Create connected application',
    responses: {
      '200': {
        description: 'Application created',
      },
    },
  };

  protected async handleRequest(
    request: CreateApplicationRequest,
    env: CreateApplicationEnv,
    cxt: RouteContext<CreateApplicationEnv>,
  ): Promise<CreateApplicationResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const maxApplications: number = ConfigurationUtil.getPositiveInteger(env.MAX_APPLICATIONS_PER_USER, DEFAULT_MAX_APPLICATIONS_PER_USER);
    if ((await dao.countByUserEmail(userEmail)) >= maxApplications) {
      throw new BadRequestError(`Maximum ${maxApplications} connected applications allowed per user.`);
    }

    const credentials: ConnectedApplicationCredentials =
      request.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS
        ? {
            accessKeyId: request.accessKeyId!,
            secretAccessKey: request.secretAccessKey!,
            topicArn: request.topicArn!,
          }
        : {
            clientId: request.clientId!,
            clientSecret: request.clientSecret!,
          };
    const status: string =
      request.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS
        ? CONNECTED_APPLICATION_STATUS_CONNECTED
        : CONNECTED_APPLICATION_STATUS_DRAFT;
    const application: ConnectedApplicationMetadata = await dao.create(
      userEmail,
      request.displayName,
      request.providerId,
      request.connectionMethod,
      credentials,
      status,
    );
    return {
      application: {
        ...application,
        oauth2RedirectUri: `${BaseUrlUtil.getBaseUrl(request.raw)}/api/oauth2/callback/${application.applicationId}`,
      },
    };
  }
}

interface CreateApplicationRequest extends IRequest {
  displayName: string;
  providerId: string;
  connectionMethod: string;
  clientId?: string;
  clientSecret?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  topicArn?: string;
}

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface CreateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

interface CreateApplicationEnv extends IUserEnv {
  MAX_APPLICATIONS_PER_USER?: string | undefined;
}

export { CreateApplicationRoute };
