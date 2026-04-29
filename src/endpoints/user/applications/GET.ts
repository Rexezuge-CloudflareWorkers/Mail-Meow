import { ConnectedApplicationDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata } from '@/model';
import { BaseUrlUtil } from '@/utils';

class ListApplicationsRoute extends IUserRoute<ListApplicationsRequest, ListApplicationsResponse, ListApplicationsEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'List connected applications',
    responses: {
      '200': {
        description: 'Connected applications',
      },
    },
  };

  protected async handleRequest(
    request: ListApplicationsRequest,
    env: ListApplicationsEnv,
    cxt: RouteContext<ListApplicationsEnv>,
  ): Promise<ListApplicationsResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const applications: ConnectedApplicationMetadata[] = await dao.listMetadataByUserEmail(this.getAuthenticatedUserEmailAddress(cxt));
    const baseUrl: string = BaseUrlUtil.getBaseUrl(request.raw);
    return {
      applications: applications.map((application: ConnectedApplicationMetadata) => ({
        ...application,
        oauth2RedirectUri: `${baseUrl}/api/oauth2/callback/${application.applicationId}`,
      })),
    };
  }
}

type ListApplicationsRequest = IRequest;

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface ListApplicationsResponse extends IResponse {
  applications: ApplicationResponse[];
}

type ListApplicationsEnv = IUserEnv;

export { ListApplicationsRoute };
