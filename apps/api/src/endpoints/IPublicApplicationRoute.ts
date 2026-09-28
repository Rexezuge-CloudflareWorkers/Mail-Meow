import type { ConnectedApplication } from '@mail-meow/shared/model';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { IBaseRoute } from './IBaseRoute';
import type { IRequest, IResponse, RouteContext } from './IBaseRoute';

/**
 * Base for public routes authenticated by a path API key (`/api/:api_key/*`).
 *
 * The application behind the key is resolved once in `enrichRequest` and handed
 * to the handler on the request, so no route has to repeat the lookup or decide
 * what an invalid key means.
 */
abstract class IPublicApplicationRoute<TRequest extends IPublicApplicationRequest, TResponse extends IResponse> extends IBaseRoute<
  TRequest,
  TResponse
> {
  protected override async enrichRequest(request: TRequest, c: RouteContext): Promise<TRequest> {
    const scope = createRequestScope(c.env);
    const application: ConnectedApplication = await scope.apiKeys.resolveApplication(c.req.param('api_key'));
    return { ...request, application };
  }
}

interface IPublicApplicationRequest extends IRequest {
  application: ConnectedApplication;
}

export { IPublicApplicationRoute };
export type { IPublicApplicationRequest };
export type { IResponse, RouteContext } from './IBaseRoute';
