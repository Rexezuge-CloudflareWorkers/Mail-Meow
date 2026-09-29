import { describe, expect, it, vi, afterEach } from 'vitest';
import { toErrorResponse, clientFacingMessage } from '@/errors/errorResponse';
import { BadRequestError, ConflictError, DatabaseError, NotFoundError, ServiceError, UnauthorizedError } from '@mail-meow/backend-errors';

/**
 * The one disclosure decision the API layer makes.
 *
 * This rule lived in two places — `IBaseRoute.toErrorResponse` and
 * `MiddlewareHandlers.userAuthentication` — and the copies had already diverged.
 * The middleware version did not substitute the generic message for a 5xx and
 * did not mask an untyped error, so the same database failure could return a
 * D1 error string from one path and a generic 500 from the other. These cases
 * pin the behaviour both callers now share.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toErrorResponse — typed errors', () => {
  it('maps a 4xx to its own status, type, and message', () => {
    const response = toErrorResponse(new NotFoundError('Connected application was not found.'));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ Exception: { Type: 'NotFound', Message: 'Connected application was not found.' } });
    expect(response.isCallerError).toBe(true);
  });

  it('uses the default message when none is supplied', () => {
    expect(toErrorResponse(new BadRequestError()).body.Exception.Message).toBe(
      'The request could not be understood or was missing required parameters.',
    );
  });

  it('marks a 401 as the caller’s problem', () => {
    const response = toErrorResponse(new UnauthorizedError('API key is required.'));

    expect(response.status).toBe(401);
    expect(response.isCallerError).toBe(true);
  });

  it('never returns a 5xx message verbatim', () => {
    // A DatabaseError message is built from the raw D1 text, which carries
    // table and column names. Handing that to an API client is an information
    // disclosure, and this is the decision that prevents it.
    const response = toErrorResponse(new DatabaseError('Failed to read: SELECT * FROM users — no such column: ssn'));

    expect(response.status).toBe(500);
    expect(response.body.Exception.Message).not.toContain('ssn');
    expect(response.body.Exception.Message).not.toContain('SELECT');
    // The *type* is deliberately preserved even at 5xx: it is the stable
    // machine-readable contract, and a client needs to know a database failed
    // rather than a validation failed. Only the message is substituted.
    expect(response.body.Exception.Type).toBe('DatabaseError');
  });

  it('does not treat a 5xx as the caller’s fault', () => {
    // The auth middleware rethrows these so the entrypoint still logs them.
    expect(toErrorResponse(new DatabaseError('D1 down')).isCallerError).toBe(false);
  });

  it('carries no log detail for a typed error', () => {
    // The type is logged instead; repeating the message would duplicate it.
    expect(toErrorResponse(new BadRequestError('nope')).logDetail).toBeNull();
  });
});

describe('toErrorResponse — untyped errors', () => {
  it('masks an untyped error behind a generic 500', () => {
    const response = toErrorResponse(new TypeError('undefined is not a function'));

    // A bare Error tells the route layer nothing, so it cannot become a status.
    expect(response.status).toBe(500);
    expect(response.body.Exception.Type).toBe('InternalServerError');
    expect(response.body.Exception.Message).not.toContain('undefined is not a function');
  });

  it('is never the caller’s fault', () => {
    expect(toErrorResponse(new TypeError('boom')).isCallerError).toBe(false);
  });

  it('redacts a secret out of the log detail', () => {
    // A provider error can carry an Authorization header; the log must not.
    const response = toErrorResponse(new Error('Gmail send failed: Authorization: Bearer super.secret.token'));

    expect(response.logDetail).toContain('Bearer [REDACTED]');
    expect(response.logDetail).not.toContain('super.secret.token');
  });

  it('handles a thrown non-Error', () => {
    const response = toErrorResponse('just a string');

    expect(response.status).toBe(500);
    expect(response.logDetail).toBe('just a string');
  });
});

describe('toErrorResponse — redaction of 4xx messages', () => {
  it('redacts a secret even from an author-written 4xx message', () => {
    // Belt and braces: a 4xx is returned as authored, but an authored message
    // can still quote back the value the caller just sent.
    const response = toErrorResponse(new BadRequestError('Invalid value: client_secret=hunter2'));

    expect(response.body.Exception.Message).not.toContain('hunter2');
  });
});

describe('clientFacingMessage', () => {
  it('substitutes the generic message for a 5xx', () => {
    const generic: ServiceError = new DatabaseError('internal detail');
    expect(clientFacingMessage(generic)).not.toContain('internal detail');
  });

  it('returns a 4xx message as authored', () => {
    expect(clientFacingMessage(new ConflictError('Email is already in use.'))).toBe('Email is already in use.');
  });
});
