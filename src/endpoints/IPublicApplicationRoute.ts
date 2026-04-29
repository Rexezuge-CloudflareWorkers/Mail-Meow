import { ApplicationApiKeyDAO, ConnectedApplicationDAO } from '@/dao';
import { UnauthorizedError } from '@/error';
import type { ApplicationApiKeyMetadata, ConnectedApplication } from '@/model';
import { ApiKeyUtil } from '@/utils';
import { IBaseRoute } from './IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext, ExtendedResponse } from './IBaseRoute';

abstract class IPublicApplicationRoute<
  TRequest extends IPublicApplicationRequest,
  TResponse extends IResponse,
  TEnv extends IPublicApplicationEnv,
> extends IBaseRoute<TRequest, TResponse, TEnv> {
  async handle(c: RouteContext<TEnv>) {
    try {
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      const { validateRequestInput } = await import('@/schema');
      const validatedBody: unknown = await validateRequestInput(c.req.raw, body);
      const apiKey: string | undefined = c.req.param('api_key');
      const application: ConnectedApplication = await this.resolveConnectedApplication(apiKey, c.env as TEnv);
      const request: TRequest = { ...(validatedBody as TRequest), raw: c.req.raw, application };
      const response: TResponse | ExtendedResponse<TResponse> = await this.handleRequest(request, c.env as TEnv, c);
      return this.toResponse(response, c);
    } catch (error: unknown) {
      return this.toErrorResponse(error, c);
    }
  }

  private async resolveConnectedApplication(apiKey: string | undefined, env: TEnv): Promise<ConnectedApplication> {
    if (!apiKey) {
      throw new UnauthorizedError('API key is required.');
    }
    const keyHash: string = await ApiKeyUtil.hashApiKey(apiKey);
    const apiKeyDAO: ApplicationApiKeyDAO = new ApplicationApiKeyDAO(env.DB);
    const keyMetadata: ApplicationApiKeyMetadata | undefined = await apiKeyDAO.getByHash(keyHash, true);
    if (!keyMetadata) {
      throw new UnauthorizedError('The API key is invalid or expired.');
    }
    await apiKeyDAO.updateLastUsed(keyMetadata.apiKeyId);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const connectedApplicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await connectedApplicationDAO.getById(keyMetadata.applicationId);
    if (!application) {
      throw new UnauthorizedError('The API key is not connected to an application.');
    }
    return application;
  }
}

interface IPublicApplicationRequest extends IRequest {
  application: ConnectedApplication;
}

interface IPublicApplicationEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { IPublicApplicationRoute };
export type { ExtendedResponse, IPublicApplicationEnv, IPublicApplicationRequest, IResponse, RouteContext };
