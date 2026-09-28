import type { ContentfulStatusCode } from 'hono/utils/http-status';

type ErrorCode = ContentfulStatusCode;

/**
 * Base for every error the application raises deliberately.
 *
 * Subclasses supply a status and a stable type string; the default message is
 * overridable per instance. Throwing one of these (rather than a bare `Error`)
 * is what lets the route layer map a failure to a real status code — an untyped
 * error is masked as a generic 500 because nothing can be inferred from it.
 */
abstract class ServiceError extends Error {
  /**
   * Whether retrying the same operation could plausibly succeed.
   *
   * Read by `executeD1WithRetry` and by the background refresh task. A mutable
   * public field rather than a getter because it is a per-instance decision:
   * the same error class is retryable or not depending on the cause.
   */
  public retryable: boolean = false;

  public abstract getErrorCode(): ErrorCode;

  /**
  Stable, machine-readable identifier. Not the class name: it is part of the API contract.
  */
  public abstract getErrorType(): string;

  public abstract getErrorMessage(): string;
}

export { ServiceError };
export type { ErrorCode };
