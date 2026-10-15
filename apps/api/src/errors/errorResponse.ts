import { ServiceError } from '@rexezuge/errors';
import { errorBody, toServiceError } from '@rexezuge/http';
import { ErrorSanitizationUtil } from '@rexezuge/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

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
 * The taxonomy and the envelope now come from `@rexezuge/{errors,http}`: the
 * 5xx-mask is `expose` in the catalog, applied by `errorBody`, which is where
 * the family puts it so nine repos stop carrying nine copies of the rule. What
 * stays here is the two decisions the family does not make on our behalf — the
 * redaction backstop, and whether the *caller* owns the failure, because the
 * two consumers need opposite halves of that answer.
 */
interface ErrorResponse {
  status: ContentfulStatusCode;
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
 * `error.expose` already draws the line — 4xx is authored for the caller, 5xx
 * is masked — and `errorBody` is where that becomes bytes. This adds the
 * redaction backstop on the 4xx side, because the two are not the same
 * decision: a 4xx message is *authored* for the caller but a service is free to
 * compose it from client input, and `OAuth2AuthorizationService` interpolates a
 * client-supplied redirect URI into one. `errorBody`'s masked 5xx text is a
 * constant and needs no such pass.
 */
function clientFacingMessage(error: ServiceError): string {
  if (!error.expose) {
    return errorBody(error).Exception.Message;
  }
  return ErrorSanitizationUtil.sanitizeMessage(error.message);
}

/**
 * Maps a caught value to a status, a body, and a logging decision.
 *
 * Returns the decision rather than performing it, because the two callers need
 * different halves: `IBaseRoute` always answers with the envelope, while the
 * auth middleware has to rethrow anything that is not the caller's fault.
 *
 * `toServiceError` normalizes an untyped throw — a provider response body, an
 * `Authorization` header — into a 500 before anything reads its message, which
 * is what keeps an untyped value out of the response.
 */
function toErrorResponse(error: unknown): ErrorResponse {
  const serviceError: ServiceError = toServiceError(error);
  const body: ErrorEnvelope = errorBody(serviceError);
  body.Exception.Message = clientFacingMessage(serviceError);

  if (error instanceof ServiceError) {
    return {
      status: serviceError.status as ContentfulStatusCode,
      body,
      isCallerError: serviceError.status < 500,
      logDetail: null,
    };
  }

  return {
    status: serviceError.status as ContentfulStatusCode,
    body,
    isCallerError: false,
    logDetail: ErrorSanitizationUtil.sanitizeErrorForLogging(error),
  };
}

export { clientFacingMessage, toErrorResponse };
export type { ErrorEnvelope, ErrorResponse };
