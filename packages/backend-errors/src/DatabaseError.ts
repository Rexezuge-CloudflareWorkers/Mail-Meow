import { HttpServiceError } from './HttpServiceError';

/**
 * A D1 failure.
 *
 * `retryable` is supplied by the thrower because D1 distinguishes a transient
 * lock or timeout from a constraint violation, and only the classifier that read
 * the error text knows which it was.
 */
class DatabaseError extends HttpServiceError<'InternalServerError'> {
  constructor(message?: string, retryable: boolean = false) {
    super('InternalServerError', message ?? 'The system encountered an unexpected problem while accessing the database.');
    this.retryable = retryable;
  }

  public override getErrorType(): string {
    return 'DatabaseError';
  }
}

export { DatabaseError };
