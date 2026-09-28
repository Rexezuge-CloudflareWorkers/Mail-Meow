import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OAuth2AccessTokenRefreshTask } from '@mail-meow/background/scheduled/OAuth2AccessTokenRefreshTask';
import { BackgroundTaskRunPruningTask } from '@mail-meow/background/scheduled/BackgroundTaskRunPruningTask';
import { BACKGROUND_TASK_TYPE_OAUTH2_REFRESH } from '@mail-meow/shared/constants';
import { createMockDb } from '../helpers/mockDb';

/**
 * The scheduled tasks' run records.
 *
 * `IScheduledTask` already has coverage for the Template Method itself. What
 * was untested is what the concrete tasks *report*, and that is what an
 * operator reads when a mailbox has silently stopped refreshing. A run record
 * saying "3 of 25 failed" with no reason is not actionable: a revoked grant, an
 * expired refresh token, and a provider outage all look identical.
 */

const { listDueApplicationIds } = vi.hoisted(() => ({ listDueApplicationIds: vi.fn() }));
const { refreshAccessToken } = vi.hoisted(() => ({ refreshAccessToken: vi.fn() }));

vi.mock('@mail-meow/backend-data/dao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mail-meow/backend-data/dao')>();
  return {
    ...actual,
    // The status DAO is the only collaborator that reads D1 here; the rest of
    // the layer is exercised by its own tests.
    OAuth2AccessTokenRefreshStatusDAO: class {
      public listDueApplicationIds = listDueApplicationIds;
    },
  };
});

vi.mock('@mail-meow/backend-services/composition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mail-meow/backend-services/composition')>();
  return {
    ...actual,
    createRequestScope: () => ({
      config: { oauth2AccessTokenRefreshWindowSeconds: 900, oauth2TokenRefreshBatchSize: 25 },
      oauth2AccessTokens: { refreshAccessToken },
    }),
  };
});

const ENV = {
  DB: makeDb().db,
  AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('key') },
  OAUTH2_TOKEN_CACHE: {},
  OAUTH2_TOKEN_REFRESHERS: {},
} as never;

const CTX = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as never;
const EVENT = { cron: '*/10 * * * *', scheduledTime: 0, noRetry: vi.fn() } as never;

/**
 * The D1 binding both tasks need.
 *
 * `createD1SessionEnv` calls `DB.withSession(...)`, so a bare `createMockDb`
 * is not enough — without it the task throws before reaching the DAO, and the
 * failure is reported as a task error rather than as the missing method.
 */
function makeDb(responses?: Parameters<typeof createMockDb>[0]): ReturnType<typeof createMockDb> {
  const mock = createMockDb(responses);
  const withSession = vi.fn().mockReturnValue(mock.db);
  return { ...mock, db: { ...mock.db, withSession } as never };
}

/** Runs the task and returns the summary it handed to the run log. */
async function runTask(): Promise<{ itemsProcessed: number; itemsFailed: number; summary?: string; details?: unknown }> {
  let captured: { itemsProcessed: number; itemsFailed: number; summary?: string; details?: unknown } | undefined;
  class Probe extends OAuth2AccessTokenRefreshTask {
    protected override createTaskRunDAO(): never {
      return {
        startRun: vi.fn().mockResolvedValue('run-1'),
        succeedRun: vi.fn().mockImplementation((_id: string, summary: typeof captured) => {
          captured = summary;
          return Promise.resolve(undefined);
        }),
        failRun: vi.fn().mockResolvedValue(undefined),
        skipRun: vi.fn().mockResolvedValue(undefined),
      } as never;
    }
  }
  await new Probe().handle(EVENT, ENV, CTX);
  if (!captured) throw new Error('The task did not record a run.');
  return captured;
}

beforeEach(() => {
  vi.resetAllMocks();
  listDueApplicationIds.mockResolvedValue([]);
  refreshAccessToken.mockResolvedValue({ accessToken: 'token', expiresAt: 1 });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('OAuth2AccessTokenRefreshTask', () => {
  it('records a clean run when nothing was due', async () => {
    listDueApplicationIds.mockResolvedValue([]);

    await expect(runTask()).resolves.toMatchObject({ itemsProcessed: 0, itemsFailed: 0, summary: 'Refreshed 0 of 0 tokens' });
  });

  it('counts every refreshed application', async () => {
    listDueApplicationIds.mockResolvedValue(['app-1', 'app-2', 'app-3']);

    await expect(runTask()).resolves.toMatchObject({ itemsProcessed: 3, itemsFailed: 0, summary: 'Refreshed 3 of 3 tokens' });
  });

  it('keeps refreshing the rest of the batch after one fails', async () => {
    // One bad mailbox must not abort the tick; the others still need tokens.
    listDueApplicationIds.mockResolvedValue(['app-1', 'app-2', 'app-3']);
    refreshAccessToken.mockImplementation((id: string) =>
      id === 'app-2' ? Promise.reject(new Error('refresh rejected')) : Promise.resolve({ accessToken: 't', expiresAt: 1 }),
    );

    await expect(runTask()).resolves.toMatchObject({ itemsProcessed: 2, itemsFailed: 1 });
  });

  it('reports why a refresh failed, not just that it did', async () => {
    // The regression this file exists for. A bare `catch {}` recorded only
    // "Failed to refresh OAuth2 access token for application app-1", which is
    // identical for a revoked grant and a provider outage.
    listDueApplicationIds.mockResolvedValue(['app-1']);
    refreshAccessToken.mockRejectedValue(new Error('invalid_grant: token has been revoked'));

    const result = await runTask();

    expect(result.summary).toContain('invalid_grant');
    expect(result.summary).toContain('app-1');
  });

  it('redacts a provider token out of the recorded failure', async () => {
    // The summary is persisted to D1 and served back through the task-runs API,
    // so an unsanitized provider error would put a bearer token in front of a
    // user in the Processing view.
    listDueApplicationIds.mockResolvedValue(['app-1']);
    refreshAccessToken.mockRejectedValue(new Error('401 from provider, Authorization: Bearer super.secret.token'));

    const result = await runTask();

    expect(JSON.stringify(result)).not.toContain('super.secret.token');
    expect(result.summary).toContain('[REDACTED]');
  });

  it('redacts a client secret out of the recorded failure', async () => {
    listDueApplicationIds.mockResolvedValue(['app-1']);
    refreshAccessToken.mockRejectedValue(new Error('provider rejected client_secret: hunter2-do-not-log'));

    expect(JSON.stringify(await runTask())).not.toContain('hunter2-do-not-log');
  });

  it('caps how many failures it names', async () => {
    // A provider-wide outage fails the whole batch. Dumping every line into a
    // summary column helps nobody and grows without bound.
    listDueApplicationIds.mockResolvedValue(Array.from({ length: 12 }, (_, i) => `app-${i}`));
    refreshAccessToken.mockRejectedValue(new Error('provider unreachable'));

    const result = await runTask();

    expect(result.itemsFailed).toBe(12);
    expect(result.summary).toContain('12 failed');
    expect(result.summary).toContain('+9 more');
  });

  it('records no failure details when everything succeeded', async () => {
    listDueApplicationIds.mockResolvedValue(['app-1']);

    // An always-present `details` would make a healthy run look like an incident
    // in anything keying off the field.
    await expect(runTask()).resolves.toMatchObject({ details: undefined });
  });

  it('reports the failure list structurally as well as in the summary', async () => {
    listDueApplicationIds.mockResolvedValue(['app-1', 'app-2']);
    refreshAccessToken.mockImplementation((id: string) =>
      id === 'app-1' ? Promise.reject(new Error('boom one')) : Promise.reject(new Error('boom two')),
    );

    const result = await runTask();

    // Triage should not require parsing a prose summary.
    expect(result.details).toMatchObject({ totalFailures: 2 });
    expect((result.details as { failures: string[] }).failures).toHaveLength(2);
  });

  it('forces a refresh rather than trusting the cache', async () => {
    // A cron tick exists to renew before expiry; serving a cached token here
    // would make the task a no-op that reports success.
    listDueApplicationIds.mockResolvedValue(['app-1']);

    await runTask();

    expect(refreshAccessToken).toHaveBeenCalledWith('app-1', { forceRefresh: true });
  });

  it('is tracked under the oauth2_refresh task type', async () => {
    const startRun = vi.fn().mockResolvedValue('run-1');
    class Probe extends OAuth2AccessTokenRefreshTask {
      protected override createTaskRunDAO(): never {
        return {
          startRun,
          succeedRun: vi.fn().mockResolvedValue(undefined),
          failRun: vi.fn().mockResolvedValue(undefined),
          skipRun: vi.fn().mockResolvedValue(undefined),
        } as never;
      }
    }

    await new Probe().handle(EVENT, ENV, CTX);

    expect(startRun).toHaveBeenCalledWith({ taskType: BACKGROUND_TASK_TYPE_OAUTH2_REFRESH });
  });
});

describe('BackgroundTaskRunPruningTask', () => {
  it('deletes expired runs and leaves running ones alone', async () => {
    // `status != 'running'` is in the DAO's predicate; the task's job is to
    // supply the cutoff and the bound. A regression that dropped the guard
    // would delete the run currently being written.
    const db = makeDb([{ success: true, results: [], meta: { changes: 2 } }]);
    const errorSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    class Probe extends BackgroundTaskRunPruningTask {
      protected override createTaskRunDAO(): never {
        return {
          startRun: vi.fn().mockResolvedValue('run-1'),
          succeedRun: vi.fn().mockResolvedValue(undefined),
          failRun: vi.fn().mockResolvedValue(undefined),
          skipRun: vi.fn().mockResolvedValue(undefined),
        } as never;
      }
    }
    await new Probe().handle(EVENT, { DB: db.db, BACKGROUND_TASK_RUN_RETENTION_DAYS: '7' } as never, CTX);

    const del = db.statements.find((s) => s.sql.includes('DELETE FROM background_task_runs'));
    expect(del?.sql).toContain("status != 'running'");
    // Retention is honoured rather than hardcoded.
    expect(del?.bindings[0]).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) - 7 * 86_400);
    errorSpy.mockRestore();
  });
});
