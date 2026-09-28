import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestError,
  ConflictError,
  DatabaseError,
  DefaultInternalServerError,
  ForbiddenError,
  HTTP_ERROR_DEFINITIONS,
  HttpServiceError,
  InternalServerError,
  MethodNotAllowedError,
  NonRetryableError,
  NotFoundError,
  OAuth2TokenNonRetryableError,
  OAuth2TokenRetryableError,
  ProviderApiNonRetryableError,
  ProviderApiRetryableError,
  RetryableError,
  ServiceError,
  UnauthorizedError,
} from '@mail-meow/backend-errors';

describe('HTTP-semantic errors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Every row of the shared table, asserted through the concrete class, so a
  // status or default message cannot be changed in one place and not the other.
  const HTTP_CASES = [
    [BadRequestError, 400, 'BadRequest', 'The request could not be understood or was missing required parameters.'],
    [UnauthorizedError, 401, 'Unauthorized', 'Authentication is required and has failed or has not yet been provided.'],
    [ForbiddenError, 403, 'Forbidden', 'You do not have permission to perform this action.'],
    [NotFoundError, 404, 'NotFound', 'The requested resource was not found.'],
    [MethodNotAllowedError, 405, 'MethodNotAllowed', 'The requested method is not allowed for this resource.'],
    [InternalServerError, 500, 'InternalServerError', 'The server encountered an internal error and was unable to complete the request.'],
  ] as const;

  for (const [ErrorClass, code, type, defaultMessage] of HTTP_CASES) {
    it(`${ErrorClass.name} maps to ${code} with type ${type}`, () => {
      const error = new ErrorClass();
      expect(error).toBeInstanceOf(HttpServiceError);
      expect(error).toBeInstanceOf(ServiceError);
      expect(error.getErrorCode()).toBe(code);
      expect(error.getErrorType()).toBe(type);
      expect(error.getErrorMessage()).toBe(defaultMessage);
      expect(error.retryable).toBe(false);
    });
  }

  it('uses a custom message when provided', () => {
    expect(new BadRequestError('Custom error').getErrorMessage()).toBe('Custom error');
  });

  // Previously only the retryable family set `name`, so a log line reported
  // "Error" for a NotFound but "NotFoundError" for a provider failure.
  it('sets name to the concrete class for every subclass', () => {
    expect(new BadRequestError('x').name).toBe('BadRequestError');
    expect(new NotFoundError('x').name).toBe('NotFoundError');
    expect(new DatabaseError('x').name).toBe('DatabaseError');
    expect(new ProviderApiRetryableError('x').name).toBe('ProviderApiRetryableError');
  });

  it('keeps the table and the classes in agreement', () => {
    expect(Object.keys(HTTP_ERROR_DEFINITIONS).sort()).toEqual([
      'BadRequest',
      'Conflict',
      'Forbidden',
      'InternalServerError',
      'MethodNotAllowed',
      'NotFound',
      'Unauthorized',
    ]);
    expect(HTTP_ERROR_DEFINITIONS.NotFound.code).toBe(new NotFoundError().getErrorCode());
  });

  it('separates Conflict from BadRequest', () => {
    // 409 says "that value is taken" — a different caller remedy from "you typed
    // something invalid", so collapsing the two would mislead the client.
    expect(new ConflictError().getErrorCode()).toBe(409);
    expect(new ConflictError().getErrorType()).toBe('Conflict');
    expect(new ConflictError('Email is already in use').getErrorMessage()).toBe('Email is already in use');
    expect(new ConflictError('x').name).toBe('ConflictError');
  });
});

describe('DefaultInternalServerError', () => {
  it('is a reusable instance carrying the generic message', () => {
    expect(DefaultInternalServerError.getErrorCode()).toBe(500);
    expect(DefaultInternalServerError.getErrorType()).toBe('InternalServerError');
    expect(DefaultInternalServerError.getErrorMessage()).toBe(
      'The server encountered an internal error and was unable to complete the request.',
    );
  });
});

describe('DatabaseError', () => {
  it('reports itself as DatabaseError while keeping the 500 status', () => {
    const error = new DatabaseError();
    expect(error.getErrorCode()).toBe(500);
    expect(error.getErrorType()).toBe('DatabaseError');
    expect(error.getErrorMessage()).toBe('The system encountered an unexpected problem while accessing the database.');
    expect(error.retryable).toBe(false);
  });

  it('carries the retry verdict from the thrower', () => {
    expect(new DatabaseError('DB error', true).retryable).toBe(true);
    expect(new DatabaseError('DB error', true).getErrorMessage()).toBe('DB error');
  });
});

describe('outcome errors', () => {
  it('RetryableError is retryable', () => {
    const error = new RetryableError('Transient error');
    expect(error.retryable).toBe(true);
    expect(error.getErrorCode()).toBe(500);
    expect(error.getErrorType()).toBe('RetryableError');
  });

  it('NonRetryableError is not retryable', () => {
    const error = new NonRetryableError('Fatal error');
    expect(error.retryable).toBe(false);
    expect(error.getErrorType()).toBe('NonRetryableError');
  });

  // A provider or token 4xx is a permanent, client-visible condition. Reporting
  // it as a retryable 500 made the cron retry a revoked grant forever.
  const OUTCOME_CASES = [
    [ProviderApiRetryableError, true, 502],
    [OAuth2TokenRetryableError, true, 502],
    [ProviderApiNonRetryableError, false, 400],
    [OAuth2TokenNonRetryableError, false, 400],
  ] as const;

  for (const [ErrorClass, retryable, code] of OUTCOME_CASES) {
    it(`${ErrorClass.name} is retryable=${String(retryable)} and maps to ${String(code)}`, () => {
      const error = new ErrorClass('detail');
      expect(error.retryable).toBe(retryable);
      expect(error.getErrorCode()).toBe(code);
      expect(error.getErrorType()).toBe(ErrorClass.name);
    });
  }
});
