import { IBaseRoute } from './IBaseRoute';
import type { IRequest, IResponse, RouteContext } from './IBaseRoute';

/**
 * Base for routes behind Cloudflare Access.
 *
 * Authentication happens once in `MiddlewareHandlers.userAuthentication`, which
 * runs on `/user/*` and stores the verified address and the resolved account id
 * in the Hono context. This class only reads them — there is deliberately no
 * per-route auth check to forget.
 */
abstract class IUserRoute<TRequest extends IRequest, TResponse extends IResponse> extends IBaseRoute<TRequest, TResponse> {
  protected getAuthenticatedUserEmailAddress(c: RouteContext): string {
    return c.get('AuthenticatedUserEmailAddress');
  }

  /**
   * The caller's account id — the identity every user-keyed row is matched on.
   *
   * Empty on a database that has not run migration 0011, where the DAOs fall
   * back to the address, so a route never has to branch on it.
   */
  protected getAuthenticatedUserId(c: RouteContext): string {
    return c.get('AuthenticatedUserId');
  }

  /**
   * The owner to pass to a service: id where available, address always.
   *
   * `anchorEmail` is the address because that is what a pre-0011 row stores and
   * what the foreign key still points at. On a migrated database the id is what
   * the DAOs match on, so an address change does not lock a user out of their
   * own applications.
   */
  protected getAuthenticatedAccount(c: RouteContext): { id: string; email: string; anchorEmail: string } {
    const email: string = this.getAuthenticatedUserEmailAddress(c);
    return { id: this.getAuthenticatedUserId(c), email, anchorEmail: email };
  }
}

export { IUserRoute };
export type { IRequest, IResponse, RouteContext } from './IBaseRoute';
