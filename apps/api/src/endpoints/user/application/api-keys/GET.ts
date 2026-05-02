import { ApplicationApiKeyDAO, ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationApiKeyMetadata, ConnectedApplicationMetadata } from '@mail-meow/shared/model';

class ListApplicationApiKeysRoute extends IUserRoute<
  ListApplicationApiKeysRequest,
  ListApplicationApiKeysResponse,
  ListApplicationApiKeysEnv
> {
  schema = {
    tags: ['API Keys'],
    summary: 'List application API keys',
    responses: {
      '200': {
        description: 'Application API keys',
      },
    },
  };

  protected async handleRequest(
    request: ListApplicationApiKeysRequest,
    env: ListApplicationApiKeysEnv,
    cxt: RouteContext<ListApplicationApiKeysEnv>,
  ): Promise<ListApplicationApiKeysResponse> {
    const applicationId: string | null = new URL(request.raw.url).searchParams.get('applicationId');
    if (!applicationId) {
      throw new BadRequestError('applicationId is required.');
    }
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(
      applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    const apiKeyDAO: ApplicationApiKeyDAO = new ApplicationApiKeyDAO(env.DB);
    return {
      apiKeys: await apiKeyDAO.listByApplication(applicationId),
    };
  }
}

type ListApplicationApiKeysRequest = IRequest;

interface ListApplicationApiKeysResponse extends IResponse {
  apiKeys: ApplicationApiKeyMetadata[];
}

type ListApplicationApiKeysEnv = IUserEnv;

export { ListApplicationApiKeysRoute };
