import { toErrorResponse } from '@/errors/errorResponse';
import { EmailValidationUtil } from '@mail-meow/backend-services/auth';
import { Context, Next } from 'hono';
import { createRequestScope } from '@mail-meow/backend-services/composition';

type UserContext = Context<{ Bindings: Env; Variables: { AuthenticatedUserEmailAddress: string; AuthenticatedUserId: string } }>;

/**
 * Authenticate the request and resolve the address to an account.
 *
 * The account id is what identifies the caller for anything id-keyed
 * (connected applications, task-run visibility), so it is published on the
 * context next to the address. The address stays because it is the only thing
 * Cloudflare Access asserts, and because a database that has not run migration
 * 0011 has no id to publish.
 */
class MiddlewareHandlers {
  public static userAuthentication() {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    return async (c: UserContext, next: Next): Promise<Response | void> => {
      const scope = createRequestScope(c.env);
      try {
        const userEmail: string = await EmailValidationUtil.getAuthenticatedUserEmail(c.req.raw, c.env);
        // Resolve-then-create, so an address that already identifies an account
        // signs into that account rather than forking a second one.
        const account = await scope.users.upsertUser(userEmail);
        c.set('AuthenticatedUserEmailAddress', userEmail);
        // Empty on a pre-0011 database; the DAOs then key on the address alone.
        c.set('AuthenticatedUserId', account?.id ?? '');
        await next();
      } catch (error: unknown) {
        // The same disclosure decision `IBaseRoute` uses, so an authentication
        // failure and a route failure cannot return different bodies for the
        // same error. This copy previously skipped the 5xx message substitution
        // and the untyped-error masking.
        //
        // 4xx is the caller's problem and is answered here. 5xx and untyped
        // errors are rethrown: this middleware has no envelope to fall back on,
        // and the entrypoint's catch-all is what logs them.
        const response = toErrorResponse(error);
        if (!response.isCallerError) {
          throw error;
        }
        console.warn(`Responding with ${response.body.Exception.Type} during authentication`);
        return c.json(response.body, response.status);
      }
    };
  }
}

export { MiddlewareHandlers };
