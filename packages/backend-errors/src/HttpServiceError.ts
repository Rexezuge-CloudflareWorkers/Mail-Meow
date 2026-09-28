import { ServiceError } from './IServiceError';
import type { ErrorCode } from './IServiceError';

/**
 * The status/type pairs for the fixed set of HTTP-semantic errors.
 *
 * These six classes were byte-identical apart from three literals, repeated in
 * six files. A table keeps a new status from needing a new copy of the same
 * four methods, and makes the mapping auditable in one place.
 */
const HTTP_ERROR_DEFINITIONS = {
  BadRequest: { code: 400, defaultMessage: 'The request could not be understood or was missing required parameters.' },
  Unauthorized: { code: 401, defaultMessage: 'Authentication is required and has failed or has not yet been provided.' },
  Forbidden: { code: 403, defaultMessage: 'You do not have permission to perform this action.' },
  NotFound: { code: 404, defaultMessage: 'The requested resource was not found.' },
  Conflict: { code: 409, defaultMessage: 'The request conflicts with the current state of the resource.' },
  MethodNotAllowed: { code: 405, defaultMessage: 'The requested method is not allowed for this resource.' },
  InternalServerError: {
    code: 500,
    defaultMessage: 'The server encountered an internal error and was unable to complete the request.',
  },
} as const satisfies Record<string, { code: ErrorCode; defaultMessage: string }>;

type HttpErrorType = keyof typeof HTTP_ERROR_DEFINITIONS;

/**
 * A `ServiceError` with a fixed HTTP status and type.
 *
 * Concrete subclasses add nothing but a name, so define one per row:
 * `class NotFoundError extends HttpServiceError {}`.
 */
// Must genuinely extend ServiceError, not merely implement it: the route layer
// and the auth middleware both branch on `error instanceof ServiceError`, and a
// type-only `implements` leaves the prototype chain broken — which silently
// masked every typed error as a generic 500.
abstract class HttpServiceError<TType extends HttpErrorType> extends ServiceError {
  constructor(
    private readonly type: TType,
    message?: string,
  ) {
    super(message ?? HTTP_ERROR_DEFINITIONS[type].defaultMessage);
    // Without this, `name` is inherited from `Error` for these classes while the
    // retryable family set it from `new.target.name` — so log lines and
    // `sanitizeErrorForLogging` reported different names for the same failure.
    this.name = new.target.name;
  }

  public getErrorCode(): ErrorCode {
    return HTTP_ERROR_DEFINITIONS[this.type].code;
  }

  public getErrorType(): string {
    return this.type;
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

class BadRequestError extends HttpServiceError<'BadRequest'> {
  constructor(message?: string) {
    super('BadRequest', message);
  }
}

class UnauthorizedError extends HttpServiceError<'Unauthorized'> {
  constructor(message?: string) {
    super('Unauthorized', message);
  }
}

class ForbiddenError extends HttpServiceError<'Forbidden'> {
  constructor(message?: string) {
    super('Forbidden', message);
  }
}

class NotFoundError extends HttpServiceError<'NotFound'> {
  constructor(message?: string) {
    super('NotFound', message);
  }
}

/**
 * The request is well-formed but the resource is in a state that forbids it —
 * e.g. claiming an email address already verified for a different account.
 * Distinct from `BadRequest` so the caller can tell "you typed something
 * invalid" from "that value is taken", which is not retryable without a change.
 */
class ConflictError extends HttpServiceError<'Conflict'> {
  constructor(message?: string) {
    super('Conflict', message);
  }
}

class MethodNotAllowedError extends HttpServiceError<'MethodNotAllowed'> {
  constructor(message?: string) {
    super('MethodNotAllowed', message);
  }
}

class InternalServerError extends HttpServiceError<'InternalServerError'> {
  constructor(message?: string) {
    super('InternalServerError', message);
  }
}

/**
 * The 500 returned to callers when the real cause must not be disclosed.
 *
 * A separate instance so `getErrorType()` reports the same stable type while the
 * message is the generic one, regardless of which error actually occurred.
 */
const DefaultInternalServerError = new InternalServerError();

export {
  BadRequestError,
  ConflictError,
  DefaultInternalServerError,
  ForbiddenError,
  HTTP_ERROR_DEFINITIONS,
  HttpServiceError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  UnauthorizedError,
};
export type { HttpErrorType };
