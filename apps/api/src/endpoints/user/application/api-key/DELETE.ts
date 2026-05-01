import { ApplicationApiKeyDAO, ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata } from '@mail-meow/shared/model';

class DeleteApplicationApiKeyRoute extends IUserRoute<
  DeleteApplicationApiKeyRequest,
  DeleteApplicationApiKeyResponse,
  DeleteApplicationApiKeyEnv
> {
  schema = {
    tags: ['API Keys'],
    summary: 'Delete application API key',
    responses: {
      '200': {
        description: 'Application API key deleted',
      },
    },
  };

  protected async handleRequest(
    request: DeleteApplicationApiKeyRequest,
    env: DeleteApplicationApiKeyEnv,
    cxt: RouteContext<DeleteApplicationApiKeyEnv>,
  ): Promise<DeleteApplicationApiKeyResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(
      request.applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    const apiKeyDAO: ApplicationApiKeyDAO = new ApplicationApiKeyDAO(env.DB);
    await apiKeyDAO.deleteForApplication(request.apiKeyId, request.applicationId);
    return { success: true };
  }
}

interface DeleteApplicationApiKeyRequest extends IRequest {
  applicationId: string;
  apiKeyId: string;
}

interface DeleteApplicationApiKeyResponse extends IResponse {
  success: boolean;
}

type DeleteApplicationApiKeyEnv = IUserEnv;

export { DeleteApplicationApiKeyRoute };
