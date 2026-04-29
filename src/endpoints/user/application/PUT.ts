import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTED_APPLICATION_STATUS_DRAFT, CONNECTION_METHOD_ACCESS_KEYS } from '@/constants';
import { ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationCredentials, ConnectedApplicationMetadata } from '@/model';
import { BaseUrlUtil } from '@/utils';

class UpdateApplicationRoute extends IUserRoute<UpdateApplicationRequest, UpdateApplicationResponse, UpdateApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Update connected application',
    responses: {
      '200': {
        description: 'Application updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateApplicationRequest,
    env: UpdateApplicationEnv,
    cxt: RouteContext<UpdateApplicationEnv>,
  ): Promise<UpdateApplicationResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const existing: ConnectedApplicationMetadata | undefined = await dao.getMetadataByIdForUser(request.applicationId, userEmail);
    if (!existing) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (existing.providerId !== request.providerId || existing.connectionMethod !== request.connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
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
    const application: ConnectedApplicationMetadata | undefined = await dao.updateForUser(
      request.applicationId,
      userEmail,
      request.displayName,
      credentials,
      status,
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return {
      application: {
        ...application,
        oauth2RedirectUri: `${BaseUrlUtil.getBaseUrl(request.raw)}/api/oauth2/callback/${application.applicationId}`,
      },
    };
  }
}

interface UpdateApplicationRequest extends IRequest {
  applicationId: string;
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

interface UpdateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationEnv = IUserEnv;

export { UpdateApplicationRoute };
