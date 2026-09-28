import { describe, expect, it, vi } from 'vitest';
import { computeDateCutoffIso, computeUnixCutoffSeconds, DEFAULT_PRUNE_BATCH_SIZE, pruneInBatches } from '@mail-meow/backend-data/utils';
import { tasksForPhase, CRON_TASK_DEFINITIONS } from '@mail-meow/background/scheduled';
import { IScheduledTask } from '@mail-meow/background/scheduled';
import { AppConfigReader, describeSettings } from '@mail-meow/backend-runtime/config';
import { LocaleUtil } from '@mail-meow/shared/utils';
import { ApiKeyUtil } from '@mail-meow/shared/utils';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

describe('RepositoryHelper pruneInBatches', () => {
  it('stops on a short batch and reports the backlog as drained', async () => {
    const deleteBatch = vi.fn().mockResolvedValueOnce(500).mockResolvedValueOnce(500).mockResolvedValueOnce(12);

    const result = await pruneInBatches(deleteBatch, 500);

    expect(result).toEqual({ deleted: 1012, exhausted: true });
    expect(deleteBatch).toHaveBeenCalledTimes(3);
  });

  it('stops immediately when there is nothing to delete', async () => {
    const deleteBatch = vi.fn().mockResolvedValue(0);
    await expect(pruneInBatches(deleteBatch, 500)).resolves.toEqual({ deleted: 0, exhausted: true });
    expect(deleteBatch).toHaveBeenCalledOnce();
  });

  it('stops at the batch cap rather than looping without bound', async () => {
    // The unbounded version exhausted the CPU budget mid-delete on a large
    // backlog, leaving the work half done and reported as a failure.
    const deleteBatch = vi.fn().mockResolvedValue(500);

    const result = await pruneInBatches(deleteBatch, 500, 3);

    expect(deleteBatch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ deleted: 1500, exhausted: false });
  });

  it('has a sane default batch size', () => {
    expect(DEFAULT_PRUNE_BATCH_SIZE).toBeGreaterThan(0);
  });
});

describe('RepositoryHelper cutoffs', () => {
  const NOW = Date.UTC(2026, 0, 31, 12, 0, 0);

  it('computes a unix cutoff in seconds', () => {
    expect(computeUnixCutoffSeconds(30, NOW)).toBe(Math.floor(NOW / 1000) - 30 * 86_400);
  });

  it('computes an ISO date cutoff', () => {
    expect(computeDateCutoffIso(1, NOW)).toBe('2026-01-30');
  });
});

describe('TaskRegistry', () => {
  it('registers the OAuth2 refresh task in phase 1', () => {
    expect(tasksForPhase(1).map((t) => t.constructor.name)).toContain('OAuth2AccessTokenRefreshTask');
  });

  it('registers pruning in phase 2 so it runs after refreshes', () => {
    // Ordering matters: pruning mid-refresh could delete the run being written.
    expect(tasksForPhase(2).map((t) => t.constructor.name)).toContain('BackgroundTaskRunPruningTask');
  });

  it('only runs phase-1 tasks in phase 1', () => {
    const names = tasksForPhase(1).map((t) => t.constructor.name);
    expect(names).not.toContain('BackgroundTaskRunPruningTask');
  });

  it('returns an empty list for an unknown phase', () => {
    expect(tasksForPhase(99)).toEqual([]);
  });

  it('builds a fresh instance per call so tasks cannot share state', () => {
    expect(tasksForPhase(1)[0]).not.toBe(tasksForPhase(1)[0]);
  });

  it('declares a phase for every registered task', () => {
    expect(CRON_TASK_DEFINITIONS.every((d) => d.phase === 1 || d.phase === 2)).toBe(true);
  });
});

describe('IScheduledTask', () => {
  class Tracked extends IScheduledTask<Record<string, never>> {
    public calls = 0;
    protected override getTaskType(): string {
      return 'test_task';
    }
    protected createTaskRunDAO(): never {
      return {
        startRun: vi.fn().mockResolvedValue('run-1'),
        succeedRun: vi.fn().mockResolvedValue(undefined),
        failRun: vi.fn().mockResolvedValue(undefined),
        skipRun: vi.fn().mockResolvedValue(undefined),
      } as never;
    }
    protected async handleScheduledTask(): Promise<{ itemsProcessed: number; itemsFailed: number }> {
      this.calls += 1;
      return { itemsProcessed: 1, itemsFailed: 0 };
    }
  }

  class Untracked extends IScheduledTask<Record<string, never>> {
    public calls = 0;
    protected async handleScheduledTask(): Promise<void> {
      this.calls += 1;
    }
  }

  const ENV = { DB: {} } as never;
  const CTX = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as never;
  const EVENT = { cron: '* * * * *', scheduledTime: 0, noRetry: vi.fn() } as never;

  it('records a successful run when the task declares a type', async () => {
    const task = new Tracked();
    await task.handle(EVENT, ENV, CTX);
    expect(task.calls).toBe(1);
  });

  it('runs an untracked task without touching the run log', async () => {
    const task = new Untracked();
    await task.handle(EVENT, ENV, CTX);
    expect(task.calls).toBe(1);
  });

  it('does not rethrow a task failure', async () => {
    // A cron tick that throws would be reported as an error response, so the
    // Durable Object stays up and the next tick still runs.
    class Failing extends IScheduledTask<Record<string, never>> {
      protected async handleScheduledTask(): Promise<void> {
        throw new Error('task exploded');
      }
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(new Failing().handle(EVENT, ENV, CTX)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('records a failure against the run when the task throws', async () => {
    const failRun = vi.fn().mockResolvedValue(undefined);
    class FailingTracked extends IScheduledTask<Record<string, never>> {
      protected override getTaskType(): string {
        return 'failing';
      }
      protected createTaskRunDAO(): never {
        return { startRun: vi.fn().mockResolvedValue('run-9'), succeedRun: vi.fn(), failRun, skipRun: vi.fn() } as never;
      }
      protected async handleScheduledTask(): Promise<void> {
        throw new Error('task exploded');
      }
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await new FailingTracked().handle(EVENT, ENV, CTX);

    expect(failRun).toHaveBeenCalledWith('run-9', expect.stringContaining('task exploded'));
    errorSpy.mockRestore();
  });

  it('runs even when the run log cannot be written', async () => {
    // Losing visibility of a run must not stop the work.
    class Unloggable extends IScheduledTask<Record<string, never>> {
      public calls = 0;
      protected override getTaskType(): string {
        return 'unloggable';
      }
      protected createTaskRunDAO(): never {
        return {
          startRun: vi.fn().mockRejectedValue(new Error('D1 down')),
          succeedRun: vi.fn(),
          failRun: vi.fn(),
          skipRun: vi.fn(),
        } as never;
      }
      protected async handleScheduledTask(): Promise<void> {
        this.calls += 1;
      }
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const task = new Unloggable();

    await task.handle(EVENT, ENV, CTX);

    expect(task.calls).toBe(1);
    warnSpy.mockRestore();
  });
});

describe('AppConfig', () => {
  it('falls back to documented defaults', () => {
    const config = AppConfigReader.fromEnv({});
    expect(config.maxApplicationsPerUser).toBe(99);
    expect(config.providerRequestTimeoutMs).toBe(15_000);
    expect(config.debugMode).toBe(false);
  });

  it('parses configured values', () => {
    const config = AppConfigReader.fromEnv({ MAX_API_KEYS_PER_APPLICATION: '3' });
    expect(config.maxApiKeysPerApplication).toBe(3);
  });

  it('warns and falls back on a malformed value', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(AppConfigReader.fromEnv({ MAX_APPLICATIONS_PER_USER: 'many' }).maxApplicationsPerUser).toBe(99);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MAX_APPLICATIONS_PER_USER'));

    warnSpy.mockRestore();
  });

  it('rejects a non-positive integer', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(AppConfigReader.fromEnv({ MAX_APPLICATIONS_PER_USER: '0' }).maxApplicationsPerUser).toBe(99);
    expect(AppConfigReader.fromEnv({ MAX_APPLICATIONS_PER_USER: '-5' }).maxApplicationsPerUser).toBe(99);
    warnSpy.mockRestore();
  });

  it('accepts the usual boolean spellings', () => {
    expect(AppConfigReader.fromEnv({ DEBUG_MODE: 'true' }).debugMode).toBe(true);
    expect(AppConfigReader.fromEnv({ DEBUG_MODE: '1' }).debugMode).toBe(true);
    expect(AppConfigReader.fromEnv({ DEBUG_MODE: ' TRUE ' }).debugMode).toBe(true);
    expect(AppConfigReader.fromEnv({ DEBUG_MODE: 'no' }).debugMode).toBe(false);
  });

  it('warns on an unrecognized boolean', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(AppConfigReader.fromEnv({ DEBUG_MODE: 'maybe' }).debugMode).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG_MODE'));
    warnSpy.mockRestore();
  });

  it('warns about an unknown upper-case variable so a typo is not silent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    AppConfigReader.fromEnv({ MAX_APPLICATIONS_PER_USR: '5' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MAX_APPLICATIONS_PER_USR'));
    warnSpy.mockRestore();
  });

  it('does not warn about bindings or secrets', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    AppConfigReader.fromEnv({ DB: {}, AES_ENCRYPTION_KEY_SECRET: {}, OAUTH2_TOKEN_CACHE: {} });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects a default API key expiry above the maximum', () => {
    expect(() => AppConfigReader.fromEnv({ DEFAULT_API_KEY_EXPIRY_DAYS: '30', MAX_API_KEY_EXPIRY_DAYS: '7' })).toThrow(/must not exceed/);
  });

  it('rejects a refresh window below the minimum valid window', () => {
    expect(() =>
      AppConfigReader.fromEnv({ OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS: '30', OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS: '60' }),
    ).toThrow(/must exceed/);
  });

  it('survives a null or non-object env', () => {
    expect(AppConfigReader.fromEnv(null).maxApplicationsPerUser).toBe(99);
    expect(AppConfigReader.fromEnv('nonsense').maxApplicationsPerUser).toBe(99);
  });

  it('describes every setting for the docs table', () => {
    const description = describeSettings();
    expect(description).toContain('MAX_APPLICATIONS_PER_USER');
    expect(description).toContain('PROVIDER_REQUEST_TIMEOUT_MS');
  });
});

describe('ErrorSanitizationUtil', () => {
  it('redacts a bearer token', () => {
    // Regression: the pattern was /\bearer\s+./ — `\b` is zero-width, so the
    // literal `e` aligned with the `B` and the pattern could never match. Every
    // `Authorization: Bearer <token>` string reached logs intact.
    expect(ErrorSanitizationUtil.sanitizeMessage('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def.ghi');
  });

  it('redacts a bearer token regardless of the scheme case', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('authorization: bearer abc.def.ghi')).not.toContain('abc.def.ghi');
  });

  it('keeps the scheme label so a log line stays diagnosable', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('Authorization: Bearer abc.def.ghi')).toContain('Bearer [REDACTED]');
  });

  it('redacts a basic-auth credential', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('Authorization: Basic dXNlcjpwYXNz')).not.toContain('dXNlcjpwYXNz');
  });

  it('redacts an OAuth2 authorization code given as a key/value pair', () => {
    // `code` only appeared in the query-string pattern, so `code=abc` in a log
    // line leaked the very value that authorizes the exchange.
    expect(ErrorSanitizationUtil.sanitizeMessage('code=abc123')).not.toContain('abc123');
  });

  it('redacts a client id alongside the client secret', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('client_id: shhh')).not.toContain('shhh');
  });

  it('redacts a token in a key/value pair', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('access_token=supersecret')).not.toContain('supersecret');
  });

  it('redacts a token in a query string', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('?access_token=supersecret&x=1')).not.toContain('supersecret');
  });

  it('redacts a JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef';
    expect(ErrorSanitizationUtil.sanitizeMessage(`token is ${jwt}`)).toContain('[REDACTED-JWT]');
  });

  it('keeps the label so a log line stays diagnosable', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('access_token=abc')).toContain('access_token=');
  });

  it('leaves ordinary text alone', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('The application was not found.')).toBe('The application was not found.');
  });

  it('prefixes an error with its name', () => {
    expect(ErrorSanitizationUtil.sanitizeErrorForLogging(new TypeError('boom'))).toBe('TypeError: boom');
  });
});

describe('ApiKeyUtil', () => {
  it('generates a prefixed, url-safe key', () => {
    const key = ApiKeyUtil.generateApiKey();
    expect(key).toMatch(/^mm_[A-Za-z0-9_-]+$/);
  });

  it('generates a distinct key each time', () => {
    expect(ApiKeyUtil.generateApiKey()).not.toBe(ApiKeyUtil.generateApiKey());
  });

  it('hashes deterministically so lookups are stable', async () => {
    const key = ApiKeyUtil.generateApiKey();
    await expect(ApiKeyUtil.hashApiKey(key)).resolves.toBe(await ApiKeyUtil.hashApiKey(key));
  });

  it('derives a short prefix and last-four for display', () => {
    const key = ApiKeyUtil.generateApiKey();
    expect(key.startsWith(ApiKeyUtil.getPrefix(key))).toBe(true);
    expect(ApiKeyUtil.getLastFour(key)).toBe(key.slice(-4));
  });

  it('never exposes the full key in the stored parts', async () => {
    const key = ApiKeyUtil.generateApiKey();
    const hash = await ApiKeyUtil.hashApiKey(key);
    expect(hash).not.toContain(key);
    expect(ApiKeyUtil.getPrefix(key)).not.toBe(key);
  });
});

describe('LocaleUtil', () => {
  it('normalizes a regional tag to its base language', () => {
    expect(LocaleUtil.normalize('de-DE')).toBe('de');
    expect(LocaleUtil.normalize('fr-CA')).toBe('fr');
  });

  it('maps a script-qualified Chinese tag to the closest supported locale', () => {
    // zh-Hans-CN is simplified, so zh-CN is the correct answer; zh-TW would be
    // the wrong script.
    expect(LocaleUtil.normalize('zh-Hans-CN')).toBe('zh-CN');
  });

  it('passes a supported tag through', () => {
    expect(LocaleUtil.normalize('pt')).toBe('pt');
  });

  it('falls back for an unsupported or malformed tag', () => {
    expect(LocaleUtil.normalize('xx-YY')).toBe('en');
    expect(LocaleUtil.normalize('')).toBe('en');
  });

  it('handles an absent tag', () => {
    expect(LocaleUtil.normalize(undefined)).toBe('en');
  });
});
