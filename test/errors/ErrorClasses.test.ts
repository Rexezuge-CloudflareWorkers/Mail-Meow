import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  CATALOG,
  ConflictError,
  DatabaseError,
  DefaultInternalServerError,
  ForbiddenError,
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
} from '@rexezuge/errors';

/**
 * The taxonomy is `@rexezuge/errors`' — this repo no longer defines it.
 *
 * What these cases assert is therefore not "the class works" (the kit tests
 * that) but **what Mail-Meow's API surface will emit for a given failure**: the
 * status a client sees, the `Type` it switches on, and whether the message
 * survives. Those three are this repo's wire contract, and they are what the
 * OpenAPI document in `apps/api/src/openapi/components.ts` and the SPA's error
 * decoding are written against.
 *
 * The kit's own names differ from the deleted local package's
 * (`HTTP_ERROR_DEFINITIONS` → `CATALOG`, `getErrorCode()` → `.status`,
 * `getErrorType()` → `.type`, `getErrorMessage()` → `.message`). The catalog is
 * also a superset: it carries `PreconditionFailed`, `PayloadTooLarge`,
 * `UnsupportedMediaType`, `RateLimited`, `NotImplemented`, `BadGateway`,
 * `ServiceUnavailable` and `SubrequestBudgetExhausted`, none of which this repo
 * throws yet.
 */
describe('HTTP-semantic errors', () => {
  // Every row this repo throws, asserted through the concrete class, so a
  // status or default message cannot drift in the catalog without this failing.
  const HTTP_CASES = [
    [BadRequestError, 400, 'BadRequest', 'The request could not be understood or was missing required parameters.'],
    [UnauthorizedError, 401, 'Unauthorized', 'Authentication is required and has failed or has not yet been provided.'],
    [ForbiddenError, 403, 'Forbidden', 'You do not have permission to perform this action.'],
    [NotFoundError, 404, 'NotFound', 'The requested resource was not found.'],
    [MethodNotAllowedError, 405, 'MethodNotAllowed', 'The requested method is not allowed for this resource.'],
    [InternalServerError, 500, 'InternalServerError', 'The server encountered an internal error and was unable to complete your request.'],
  ] as const;

  for (const [ErrorClass, code, type, defaultMessage] of HTTP_CASES) {
    it(`${ErrorClass.name} maps to ${String(code)} with type ${type}`, () => {
      const error = new ErrorClass();
      expect(error).toBeInstanceOf(HttpServiceError);
      expect(error).toBeInstanceOf(ServiceError);
      expect(error.status).toBe(code);
      expect(error.type).toBe(type);
      expect(error.message).toBe(defaultMessage);
      expect(error.retryable).toBe(false);
    });
  }

  it('uses a custom message when provided', () => {
    expect(new BadRequestError('Custom error').message).toBe('Custom error');
  });

  // A log line that says "Error" for a NotFound but "ProviderApiRetryableError"
  // for a provider failure makes the two indistinguishable at 3am.
  it('sets name to the concrete class for every subclass', () => {
    expect(new BadRequestError('x').name).toBe('BadRequestError');
    expect(new NotFoundError('x').name).toBe('NotFoundError');
    expect(new DatabaseError('x').name).toBe('DatabaseError');
    expect(new ProviderApiRetryableError('x').name).toBe('ProviderApiRetryableError');
  });

  it('keeps the catalog and the classes in agreement', () => {
    expect(CATALOG.NotFound.status).toBe(new NotFoundError().status);
    expect(CATALOG.NotFound.defaultMessage).toBe(new NotFoundError().message);
    // `expose` is the disclosure switch `apps/api/src/errors/errorResponse.ts`
    // reads; a 4xx must expose and a 5xx must not, or the SPA is shown a D1
    // message naming tables and columns.
    expect(new NotFoundError().expose).toBe(true);
    expect(new InternalServerError().expose).toBe(false);
  });

  it('separates Conflict from BadRequest', () => {
    // 409 says "that value is taken" — a different caller remedy from "you typed
    // something invalid", so collapsing the two would mislead the client.
    expect(new ConflictError().status).toBe(409);
    expect(new ConflictError().type).toBe('Conflict');
    expect(new ConflictError('Email is already in use').message).toBe('Email is already in use');
    expect(new ConflictError('x').name).toBe('ConflictError');
  });
});

describe('DefaultInternalServerError', () => {
  it('is a reusable instance carrying the generic message', () => {
    expect(DefaultInternalServerError.status).toBe(500);
    expect(DefaultInternalServerError.type).toBe('InternalServerError');
    expect(DefaultInternalServerError.message).toBe('The server encountered an internal error and was unable to complete your request.');
  });
});

describe('DatabaseError', () => {
  it('reports itself as DatabaseError while keeping the 500 status', () => {
    const error = new DatabaseError();
    // 500, not 502: a D1 failure is this server's problem regardless of whether
    // it reads retryable, and the previous local catalog mapped every database
    // error through the outcome table where it inherited a 502.
    expect(error.status).toBe(500);
    expect(error.type).toBe('DatabaseError');
    expect(error.message).toBe('The system encountered an unexpected problem while accessing the database.');
    expect(error.retryable).toBe(false);
    // A 500 never publishes its own message, so the generic text is what a
    // caller receives regardless of the D1 detail in `message`.
    expect(error.expose).toBe(false);
  });

  it('carries the retry verdict from the thrower', () => {
    expect(new DatabaseError('DB error', true).retryable).toBe(true);
    expect(new DatabaseError('DB error', true).message).toBe('DB error');
  });
});

describe('outcome errors', () => {
  it('RetryableError is retryable', () => {
    const error = new RetryableError('Transient error');
    expect(error.retryable).toBe(true);
    // The thrower now owns the status rather than inheriting one from a class
    // name lookup table, so the default is the retryable outcome: 502, a bad
    // upstream, which is what this actually means.
    expect(error.status).toBe(502);
    expect(error.type).toBe('RetryableError');
  });

  it('NonRetryableError is not retryable', () => {
    const error = new NonRetryableError('Fatal error');
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(400);
    expect(error.type).toBe('NonRetryableError');
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
      expect(error.status).toBe(code);
      expect(error.type).toBe(ErrorClass.name);
    });
  }
});

describe('ServiceError.from', () => {
  it('passes a ServiceError through untouched', () => {
    const original = new NotFoundError('gone');
    expect(ServiceError.from(original)).toBe(original);
  });

  it('normalizes an untyped throw to a 500 that does not expose its message', () => {
    const error = ServiceError.from(new TypeError('undefined is not a function'));
    expect(error.status).toBe(500);
    expect(error.expose).toBe(false);
    expect(error.cause).toBeInstanceOf(TypeError);
  });
});
