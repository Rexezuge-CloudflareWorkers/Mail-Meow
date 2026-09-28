import { describe, expect, it, vi } from 'vitest';
import { executeD1WithRetry, assertD1Success } from '@mail-meow/backend-data/utils';
import { DatabaseError } from '@mail-meow/backend-errors';
import { createFailingDb } from '../helpers/mockDb';

// Keep the suite fast: the backoff is real, so shrink it rather than mock timers.
const FAST = { baseDelayMs: 1, maxRetries: 2 };

const ok = <T>(results: T[] = []): D1Result => ({ success: true, results, meta: {} }) as unknown as D1Result;
const fail = (error: string): D1Result => ({ success: false, error, results: [], meta: {} }) as unknown as D1Result;

describe('executeD1WithRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const operation = vi.fn().mockResolvedValue(ok());

    const result = await executeD1WithRetry(operation, 'do thing', FAST);

    expect(result.success).toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries a failure the classifier considers retryable', async () => {
    // D1 surfaces transient conditions in the error text; the classifier decides.
    const operation = vi.fn().mockResolvedValueOnce(fail('D1_ERROR: request timeout')).mockResolvedValue(ok());

    const result = await executeD1WithRetry(operation, 'do thing', FAST);

    expect(result.success).toBe(true);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable failure', async () => {
    const operation = vi.fn().mockResolvedValue(fail('UNIQUE constraint failed: table.x'));

    await expect(executeD1WithRetry(operation, 'do thing', FAST)).rejects.toBeInstanceOf(DatabaseError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('stops after maxRetries and reports the last failure', async () => {
    const operation = vi.fn().mockResolvedValue(fail('D1_ERROR: request timeout'));

    await expect(executeD1WithRetry(operation, 'do thing', { baseDelayMs: 1, maxRetries: 2 })).rejects.toThrow(/request timeout/);
    // 1 initial attempt plus 2 retries.
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('wraps a thrown error, preserving the retry verdict', async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error('D1_ERROR: connection reset')).mockResolvedValue(ok());

    const result = await executeD1WithRetry(operation, 'do thing', FAST);

    expect(result.success).toBe(true);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('marks a persistent connection failure as retryable', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('D1_ERROR: connection reset'));

    const error: unknown = await executeD1WithRetry(operation, 'do thing', { baseDelayMs: 1, maxRetries: 0 }).catch((e) => e);

    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).retryable).toBe(true);
  });

  it('marks a thrown non-Database error as non-retryable when the text is unrelated', async () => {
    const operation = vi.fn().mockRejectedValue(new TypeError('x is not a function'));

    const error: unknown = await executeD1WithRetry(operation, 'do thing', { baseDelayMs: 1, maxRetries: 0 }).catch((e) => e);

    expect((error as DatabaseError).retryable).toBe(false);
  });

  it('names the operation in the thrown message', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(executeD1WithRetry(operation, 'prune old runs', { baseDelayMs: 1, maxRetries: 0 })).rejects.toThrow(
      /Failed to prune old runs: boom/,
    );
  });

  it('varies the backoff delay rather than retrying in lockstep', async () => {
    // Without jitter, every Worker woken by the same cron tick retries in
    // lockstep and reproduces the contention that caused the failure. Measured on
    // the requested delays rather than elapsed time, which would be flaky.
    const delays: number[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1);

    await executeD1WithRetry(vi.fn().mockResolvedValue(fail('D1_ERROR: timeout')), 'x', { baseDelayMs: 100, maxRetries: 1 }).catch(
      () => undefined,
    );

    expect(delays).toHaveLength(1);
    // The same attempt with a different jitter factor must produce a different wait.
    expect(delays[0]).toBeGreaterThanOrEqual(50);
    vi.restoreAllMocks();
  });

  it('applies exponential growth across attempts', async () => {
    const delays: number[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    // Jitter pinned high so the ceiling dominates and the growth is observable.
    vi.spyOn(Math, 'random').mockReturnValue(1);

    await executeD1WithRetry(vi.fn().mockResolvedValue(fail('D1_ERROR: timeout')), 'x', { baseDelayMs: 100, maxRetries: 2 }).catch(
      () => undefined,
    );

    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);
    vi.restoreAllMocks();
  });

  it('drives a real statement chain', async () => {
    const db = createFailingDb('UNIQUE constraint failed');
    await expect(executeD1WithRetry(() => db.prepare('SELECT 1').run(), 'read', FAST)).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('assertD1Success', () => {
  it('passes a successful result through', () => {
    expect(() => {
      assertD1Success(ok(), 'read');
    }).not.toThrow();
  });

  it('throws with the context and a retry verdict on failure', () => {
    expect(() => {
      assertD1Success(fail('D1_ERROR: timeout'), 'read rows');
    }).toThrow(/Failed to read rows: D1_ERROR: timeout/);

    const error: unknown = (() => {
      try {
        assertD1Success(fail('D1_ERROR: timeout'), 'read rows');
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect((error as DatabaseError).retryable).toBe(true);
  });

  it('falls back to a generic message when the result carries no error text', () => {
    expect(() => {
      assertD1Success({ success: false, results: [], meta: {} } as unknown as D1Result, 'read');
    }).toThrow(/Unknown database error/);
  });
});
