import { DatabaseError } from '@mail-meow/backend-errors';
import { isD1ErrorRetryable } from './D1ErrorClassifier';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;
/**
Partial jitter: delay is uniform in [floor * ceiling, ceiling].
*/
const JITTER_FLOOR_RATIO = 0.5;

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve: (value: void) => void): unknown => setTimeout(resolve, ms));
}

function assertD1Success(result: D1Result, context: string): void {
  if (result.success) {
    return;
  }
  const errorMessage: string = result.error ?? 'Unknown database error';
  throw new DatabaseError(`Failed to ${context}: ${errorMessage}`, isD1ErrorRetryable(errorMessage));
}

/**
 * Exponential backoff with partial jitter.
 *
 * Without jitter, every Worker woken by the same cron tick retries in lockstep
 * and reproduces the contention that caused the failure. `Math.random` is
 * acceptable here: this only spreads retry timing, it selects no secret and
 * guards no security boundary.
 */
function backoffDelay(baseDelayMs: number, attempt: number): number {
  const ceiling: number = baseDelayMs * 2 ** attempt;
  // eslint-disable-next-line sonarjs/pseudo-random -- retry jitter only; see above
  const jitter: number = Math.random();
  return Math.round(ceiling * (JITTER_FLOOR_RATIO + (1 - JITTER_FLOOR_RATIO) * jitter));
}

/**
Normalizes anything thrown into a `DatabaseError` carrying a retry verdict.
*/
function toDatabaseError(error: unknown, context: string): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }
  const detail: string = error instanceof Error ? error.message : String(error);
  return new DatabaseError(`Failed to ${context}: ${detail}`, isD1ErrorRetryable(detail));
}

function shouldRetry(error: DatabaseError, isLastAttempt: boolean): boolean {
  return error.retryable && !isLastAttempt;
}

async function executeD1WithRetry(operation: () => Promise<D1Result>, context: string, options?: RetryOptions): Promise<D1Result> {
  const maxRetries: number = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs: number = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastError: DatabaseError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const isLastAttempt: boolean = attempt === maxRetries;
    try {
      const result: D1Result = await operation();
      if (result.success) {
        return result;
      }
      const detail: string = result.error ?? 'Unknown database error';
      const error = new DatabaseError(`Failed to ${context}: ${detail}`, isD1ErrorRetryable(detail));
      if (!shouldRetry(error, isLastAttempt)) {
        throw error;
      }
      await sleep(backoffDelay(baseDelayMs, attempt));
      lastError = error;
    } catch (caught: unknown) {
      const error: DatabaseError = toDatabaseError(caught, context);
      if (!shouldRetry(error, isLastAttempt)) {
        throw error;
      }
      await sleep(backoffDelay(baseDelayMs, attempt));
      lastError = error;
    }
  }

  throw lastError ?? new DatabaseError(`Failed to ${context} after ${maxRetries + 1} attempts`);
}

export { assertD1Success, executeD1WithRetry, sleep };
export type { RetryOptions };
