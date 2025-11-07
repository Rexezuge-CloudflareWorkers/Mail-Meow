import { IServiceError } from './IServiceError';

export class InternalServerError extends Error implements IServiceError {
  readonly statusCode = 500;
  readonly name = 'InternalServerError';

  constructor(message: string = 'Internal Server Error') {
    super(message);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}
