import { ServiceError } from './IServiceError';
import type { ErrorCode } from './IServiceError';

/**
 * Default status per outcome subclass.
 *
 * The distinction matters: a provider returning `invalid_grant` is a permanent
 * failure, and reporting it as a retryable 500 made the background task retry a
 * revoked grant every ten minutes, forever, while telling the caller the request
 * was a server fault.
 */
const STATUS_BY_OUTCOME: Record<string, ErrorCode> = {
  OAuth2TokenRetryableError: 502,
  ProviderApiRetryableError: 502,
  OAuth2TokenNonRetryableError: 400,
  ProviderApiNonRetryableError: 400,
};

const DEFAULT_OUTCOME_STATUS: ErrorCode = 500;

/**
 * An error whose retryability is decided by the thrower, not by the class.
 *
 * `type` defaults to the concrete class name, so a subclass reports itself.
 */
// Genuinely extends ServiceError so `error instanceof ServiceError` holds; the
// route layer relies on it to choose between a mapped status and a masked 500.
class OutcomeError extends ServiceError {
  private readonly errorType: string;

  constructor(message: string, options: { type?: string; retryable: boolean }) {
    super(message);
    this.retryable = options.retryable;

    this.name = new.target.name;
    this.errorType = options.type ?? this.name;
  }

  public getErrorCode(): ErrorCode {
    return STATUS_BY_OUTCOME[this.name] ?? DEFAULT_OUTCOME_STATUS;
  }

  public getErrorType(): string {
    return this.errorType;
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

class RetryableError extends OutcomeError {
  constructor(message: string) {
    super(message, { retryable: true });
  }
}

class NonRetryableError extends OutcomeError {
  constructor(message: string) {
    super(message, { retryable: false });
  }
}

class ProviderApiRetryableError extends RetryableError {}
class ProviderApiNonRetryableError extends NonRetryableError {}
class OAuth2TokenRetryableError extends RetryableError {}
class OAuth2TokenNonRetryableError extends NonRetryableError {}

export {
  NonRetryableError,
  OAuth2TokenNonRetryableError,
  OAuth2TokenRetryableError,
  OutcomeError,
  ProviderApiNonRetryableError,
  ProviderApiRetryableError,
  RetryableError,
  STATUS_BY_OUTCOME,
};
