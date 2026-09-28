import { IBaseRoute } from './IBaseRoute';
import type { IRequest, IResponse, RouteContext } from './IBaseRoute';

/**
 * Base for routes behind Cloudflare Access.
 *
 * Authentication happens once in `MiddlewareHandlers.userAuthentication`, which
 * runs on `/user/*` and stores the verified address in the Hono context. This
 * class only reads it — there is deliberately no per-route auth check to forget.
 */
abstract class IUserRoute<TRequest extends IRequest, TResponse extends IResponse> extends IBaseRoute<TRequest, TResponse> {
  protected getAuthenticatedUserEmailAddress(c: RouteContext): string {
    return c.get('AuthenticatedUserEmailAddress');
  }
}

export { IUserRoute };
export type { IRequest, IResponse, RouteContext } from './IBaseRoute';
