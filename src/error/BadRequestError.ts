import { IServiceError } from './IServiceError';

export class BadRequestError extends Error implements IServiceError {
  readonly statusCode = 400;
  readonly name = 'BadRequestError';

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}
