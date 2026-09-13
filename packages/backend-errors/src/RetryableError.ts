import { ErrorCode, ServiceError } from './IServiceError';

class RetryableError extends ServiceError {
  public override retryable = true;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }

  public getErrorCode(): ErrorCode {
    return 500;
  }

  public getErrorType(): string {
    return this.name;
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

export { RetryableError };
