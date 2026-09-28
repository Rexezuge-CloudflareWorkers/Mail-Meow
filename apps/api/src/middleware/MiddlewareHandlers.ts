import { ServiceError } from '@mail-meow/backend-errors';
import { EmailValidationUtil } from '@mail-meow/backend-services/auth';
import { Context, Next } from 'hono';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

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
        // Mirrors IBaseRoute.toErrorResponse: 4xx is the caller's problem and is
        // returned; 5xx is rethrown so the entrypoint's catch-all reports it.
        if (error instanceof ServiceError && error.getErrorCode() < 500) {
          return c.json(
            { Exception: { Type: error.getErrorType(), Message: ErrorSanitizationUtil.sanitizeMessage(error.getErrorMessage()) } },
            error.getErrorCode(),
          );
        }
        throw error;
      }
    };
  }
}

export { MiddlewareHandlers };
