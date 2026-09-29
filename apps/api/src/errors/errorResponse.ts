import { DefaultInternalServerError, ServiceError } from '@mail-meow/backend-errors';
import type { ErrorCode } from '@mail-meow/backend-errors';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

/**
 * The error envelope every API response uses.
 *
 * `Type` is the stable, machine-readable contract; `Message` is for humans and
 * is not guaranteed to stay the same.
 */
interface ErrorEnvelope {
  Exception: { Type: string; Message: string };
}

/**
 * The single place a caught value becomes an HTTP response in the API layer.
 *
 * This rule was written twice: once in `IBaseRoute.toErrorResponse` and once in
 * `MiddlewareHandlers.userAuthentication`, which described itself as mirroring
 * the first. Two copies of a disclosure decision drift, and these had already
 * diverged — the middleware omitted the 5xx message substitution and the
 * untyped-error masking, so the same underlying failure produced different
 * bodies depending on which layer caught it.
 *
 * It lives in `apps/api` rather than `backend-errors` because it needs
 * `ErrorSanitizationUtil` (Layer 0, but `backend-errors` is deliberately
 * dependency-free at Layer 0) and because both callers are API-layer.
 */
interface ErrorResponse {
  status: ErrorCode;
  body: ErrorEnvelope;
  /**
   * Whether the failure is the caller's problem.
   *
   * False for anything 5xx or untyped. Those must reach the entrypoint's
   * catch-all, which is what produces the server-side log line; answering them
   * at the auth boundary would swallow a database failure silently.
   */
  isCallerError: boolean;
  /**
   * Redacted detail to log, or null when the type alone is the whole story.
   */
  logDetail: string | null;
}

/**
 * Decides what the caller is allowed to see.
 *
 * 5xx messages are built from raw D1 errors and provider response bodies, so
 * passing them through verbatim hands API clients internal detail — table and
 * column names, and whatever the provider echoed back. 4xx messages are authored
 * for the caller and returned as-is, after redaction as a backstop. Both the log
 * and the response are redacted, so neither leaks the raw text.
 */
function clientFacingMessage(error: ServiceError): string {
  if (error.getErrorCode() >= 500) {
    return DefaultInternalServerError.getErrorMessage();
  }
  return ErrorSanitizationUtil.sanitizeMessage(error.getErrorMessage());
}

/**
 * Maps a caught value to a status, a body, and a logging decision.
 *
 * Returns the decision rather than performing it, because the two callers need
 * different halves: `IBaseRoute` always answers with the envelope, while the
 * auth middleware has to rethrow anything that is not the caller's fault.
 */
function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ServiceError) {
    return {
      status: error.getErrorCode(),
      body: { Exception: { Type: error.getErrorType(), Message: clientFacingMessage(error) } },
      isCallerError: error.getErrorCode() < 500,
      logDetail: null,
    };
  }
  // An untyped error can carry a provider response body or an Authorization
  // header, so it is redacted before it reaches any log or response.
  return {
    status: DefaultInternalServerError.getErrorCode(),
    body: {
      Exception: { Type: DefaultInternalServerError.getErrorType(), Message: DefaultInternalServerError.getErrorMessage() },
    },
    isCallerError: false,
    logDetail: ErrorSanitizationUtil.sanitizeErrorForLogging(error),
  };
}

export { clientFacingMessage, toErrorResponse };
export type { ErrorEnvelope, ErrorResponse };
