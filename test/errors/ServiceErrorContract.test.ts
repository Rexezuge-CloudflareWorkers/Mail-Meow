import { describe, expect, it } from 'vitest';
import * as errors from '@mail-meow/backend-errors';

/**
 * Every exported error class is instantiated with a bare message and checked
 * against `ServiceError`.
 *
 * The route layer and the auth middleware both branch on
 * `error instanceof ServiceError` to decide between a mapped status code and a
 * masked generic 500. A class that satisfies the interface *structurally* but
 * does not extend the base would typecheck and then mask every typed error —
 * turning a 404 into a 500 with no other symptom.
 */
const ERROR_CLASSES = [
  'BadRequestError',
  'UnauthorizedError',
  'ForbiddenError',
  'NotFoundError',
  'MethodNotAllowedError',
  'InternalServerError',
  'DatabaseError',
  'RetryableError',
  'NonRetryableError',
  'ProviderApiRetryableError',
  'ProviderApiNonRetryableError',
  'OAuth2TokenRetryableError',
  'OAuth2TokenNonRetryableError',
] as const;

describe('ServiceError nominal contract', () => {
  for (const className of ERROR_CLASSES) {
    it(`${className} is an instance of ServiceError and Error`, () => {
      const exported = errors[className] as unknown as new (message?: string) => Error & { getErrorCode(): number };
      const error = new exported('boom');

      expect(error).toBeInstanceOf(errors.ServiceError);
      expect(error).toBeInstanceOf(Error);
      expect(typeof error.getErrorCode()).toBe('number');
    });
  }

  it('exports ServiceError itself as a class, not only a type', () => {
    // A type-only export would make `instanceof` a compile error rather than a
    // silent runtime false, but this pins the intent.
    expect(typeof errors.ServiceError).toBe('function');
  });
});
