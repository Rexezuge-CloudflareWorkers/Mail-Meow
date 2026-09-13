import { BadRequestError } from '@mail-meow/backend-errors';
import type { ConnectedApplication } from '@mail-meow/shared/model';
import { Tokens, createRequestScope } from '@mail-meow/backend-services/composition';
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
      const { validateRequestInput } = await import('@mail-meow/shared/schema');
      const validationResult = await validateRequestInput(c.req.raw, body);
      if (!validationResult.success) {
        throw new BadRequestError(validationResult.error);
      }
      const validatedBody: unknown = validationResult.data;
      const apiKey: string | undefined = c.req.param('api_key');
      const scope = createRequestScope(c.env);
      const application: ConnectedApplication = await scope.get(Tokens.ApiKeyService).resolveApplication(apiKey);
      const request: TRequest = { ...(validatedBody as TRequest), raw: c.req.raw, application };
      const response: TResponse | ExtendedResponse<TResponse> = await this.handleRequest(request, c.env as TEnv, c);
      return this.toResponse(response, c);
    } catch (error: unknown) {
      return this.toErrorResponse(error, c);
    }
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
export type { IPublicApplicationEnv, IPublicApplicationRequest };

export { type ExtendedResponse, type IResponse, type RouteContext } from './IBaseRoute';
