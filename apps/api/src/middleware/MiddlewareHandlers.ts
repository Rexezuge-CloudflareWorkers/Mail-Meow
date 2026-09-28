import { ServiceError } from '@mail-meow/backend-errors';
import { EmailValidationUtil } from '@mail-meow/backend-services/auth';
import { Context, Next } from 'hono';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

type UserContext = Context<{ Bindings: Env; Variables: { AuthenticatedUserEmailAddress: string } }>;

class MiddlewareHandlers {
  public static userAuthentication() {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    return async (c: UserContext, next: Next): Promise<Response | void> => {
      const scope = createRequestScope(c.env);
      try {
        const userEmail: string = await EmailValidationUtil.getAuthenticatedUserEmail(c.req.raw, c.env);
        await scope.users.upsertUser(userEmail);
        c.set('AuthenticatedUserEmailAddress', userEmail);
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
