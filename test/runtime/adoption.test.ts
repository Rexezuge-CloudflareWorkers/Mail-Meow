import { describe, expect, it, vi } from 'vitest';
import { AbstractDurableObjectWorker, AbstractEntrypointWorker } from '@mail-meow/backend-runtime/base';
import { createRequestScope, Tokens } from '@mail-meow/backend-services/composition';
import { OAuth2AccessTokenRefreshStatusDAO } from '@mail-meow/backend-data/dao';
import { CONNECTION_METHOD_OAUTH2, CONNECTED_APPLICATION_STATUS_CONNECTED } from '@mail-meow/shared/constants';
import { createMockDb } from '../helpers/mockDb';

/**
 * The three seams the SDK adoption introduced that nothing else reaches.
 *
 * Each is small, and each is the kind of code that fails silently rather than
 * loudly: a worker base that logs a raw provider error, a composition root whose
 * DAO factories are never invoked, and a DAO whose upsert statements are only
 * observable in production. The coverage floors are the reason they are here, but
 * the reason they are worth having is that each one is a place where the
 * *observable* behaviour and the *correct* behaviour can differ.
 */

describe('worker bases — the unhandled-rejection sink', () => {
  /**
   * The kit's base hands the caught value to `console.error` verbatim, and says so
   * in its own header: the default is only safe when nothing in the call path can
   * carry a secret. Both of these workers sit in front of provider APIs, so both
   * override the hook. If either override is removed, a provider's
   * `Authorization: Bearer …` lands in the log verbatim — which is exactly the
   * case the sanitizer exists for, and the case its `.replaceAll` is a CodeQL
   * masking barrier for.
   */
  it('redacts the entrypoint boundary', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    class Test extends AbstractEntrypointWorker {
      protected onRequest(): Promise<Response> {
        return Promise.reject(new Error('provider said Authorization: Bearer super.secret.token'));
      }
      protected onScheduled(): Promise<void> {
        return Promise.resolve();
      }
    }

    const response = await new Test().fetch(new Request('https://example.com'), {} as never, {} as never);

    expect(response.status).toBe(500);
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('Bearer [REDACTED]');
    expect(logged).not.toContain('super.secret.token');
    errorSpy.mockRestore();
  });

  it('redacts the scheduled boundary', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    class Test extends AbstractEntrypointWorker {
      protected onRequest(): Promise<Response> {
        return Promise.resolve(new Response('ok'));
      }
      protected onScheduled(): Promise<void> {
        return Promise.reject(new Error('refresh failed: client_secret=shhh'));
      }
    }

    await new Test().scheduled({ cron: '', scheduledTime: 0, noRetry: vi.fn() }, {} as never, {} as never);

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('client_secret=shhh');
    errorSpy.mockRestore();
  });

  it('redacts the durable object boundary', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    class Test extends AbstractDurableObjectWorker<Record<string, never>> {
      protected onRequest(): Promise<Response> {
        return Promise.reject(new Error('exchange failed: access_token=supersecret'));
      }
    }

    const response = await new Test().fetch(new Request('https://example.com'));

    expect(response.status).toBe(500);
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('access_token=supersecret');
    errorSpy.mockRestore();
  });

  /**
   * `/__scheduled` is gone from the base, deliberately.
   *
   * It used to run *before* `onRequest`, which made `GET /__scheduled` an
   * unauthenticated, un-rated trigger for the cron Durable Object: it bypassed the
   * security headers, the request scope, and the rate limits, and any caller
   * could fire the scheduled work on demand. Cron runs through
   * `triggers.crons`, which needs no HTTP entry at all.
   */
  it('has no HTTP trigger for the scheduled path', async () => {
    class Test extends AbstractEntrypointWorker {
      public onRequestCalls = 0;
      public onScheduledCalls = 0;
      protected onRequest(): Promise<Response> {
        this.onRequestCalls += 1;
        return Promise.resolve(new Response('ok'));
      }
      protected onScheduled(): Promise<void> {
        this.onScheduledCalls += 1;
        return Promise.resolve();
      }
    }
    const worker = new Test();

    const response = await worker.fetch(new Request('https://example.com/__scheduled?cron=*+*+*+*+*'), {} as never, {} as never);

    expect(worker.onScheduledCalls).toBe(0);
    expect(worker.onRequestCalls).toBe(1);
    expect(response.status).toBe(200);
  });
});

describe('composition root — the DAO factories', () => {
  function env() {
    return {
      DB: createMockDb().db,
      AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue(btoa('k'.repeat(32))) },
      OAUTH2_TOKEN_CACHE: {} as never,
      OAUTH2_TOKEN_REFRESHERS: {} as never,
    };
  }

  /**
   * Every DAO factory is reachable *and memoized*.
   *
   * The memo is the reason these are factories rather than values: a DAO
   * constructed per call re-reads the master key and re-opens a D1 handle on
   * every lookup. `ConnectedApplicationDAO` makes that visible — it awaits the
   * Secrets Store in its factory, so a scope that rebuilt it per call would bill a
   * Secrets Store round trip per request.
   */
  it('resolves each DAO once and reuses it', async () => {
    const scope = createRequestScope(env());

    expect(await scope.get(Tokens.ApplicationDAO)()).toBe(await scope.get(Tokens.ApplicationDAO)());
    expect(await scope.get(Tokens.ApiKeyDAO)()).toBe(await scope.get(Tokens.ApiKeyDAO)());
    expect(await scope.get(Tokens.SessionDAO)()).toBe(await scope.get(Tokens.SessionDAO)());
    expect(await scope.get(Tokens.UserDAO)()).toBe(await scope.get(Tokens.UserDAO)());
    expect(await scope.get(Tokens.UserEmailDAO)()).toBe(await scope.get(Tokens.UserEmailDAO)());
    expect(await scope.get(Tokens.TaskRunDAO)()).toBe(await scope.get(Tokens.TaskRunDAO)());
    expect(await scope.get(Tokens.TokenCacheDAO)()).toBe(await scope.get(Tokens.TokenCacheDAO)());
  });

  /**
   * The master key is read from the Secrets Store *once per scope*, and only when
   * an encrypted DAO is first resolved. Before the token registry, construction
   * was eager and `GET /user/me` — which touches no encrypted state — paid for a
   * Secrets Store round trip on every request.
   */
  it('resolves the master key lazily and memoizes it', async () => {
    const secret = { get: vi.fn().mockResolvedValue(btoa('k'.repeat(32))) };
    const scope = createRequestScope({ ...env(), AES_ENCRYPTION_KEY_SECRET: secret });

    expect(secret.get).not.toHaveBeenCalled();

    const dao = await scope.get(Tokens.ApplicationDAO)();
    await scope.get(Tokens.TokenCacheDAO)();

    expect(dao).toBeDefined();
    expect(secret.get).toHaveBeenCalledTimes(1);
  });
});

describe('OAuth2AccessTokenRefreshStatusDAO', () => {
  it('records a refresh start, creating the row on first use', async () => {
    const mock = createMockDb([{ success: true }]);

    await new OAuth2AccessTokenRefreshStatusDAO(mock.db).recordRefreshStarted('app-1');

    const sql = mock.only().sql;
    // Upsert, not a bare insert: the row and the transition must be one statement,
    // which is what makes the three `record*` calls mutually exclusive by
    // construction rather than by the caller remembering.
    expect(sql).toContain('INSERT INTO oauth2_access_token_refresh_status');
    expect(sql).toContain('ON CONFLICT(application_id) DO UPDATE SET');
    // The full column list is spelled out rather than `SELECT *`, so a column
    // added to the table later cannot silently change what this reads.
    for (const column of ['access_token_expires_at', 'last_refresh_started_at', 'last_refresh_succeeded_at', 'last_refresh_failed_at']) {
      expect(sql).toContain(column);
    }
    // Only the start timestamp is carried; the other three stay NULL.
    expect(sql).toContain('last_refresh_started_at = excluded.last_refresh_started_at');
    expect(sql).not.toContain('last_error = excluded.last_error');
  });

  it('records a success and clears the previous failure in one statement', async () => {
    const mock = createMockDb([{ success: true }]);

    await new OAuth2AccessTokenRefreshStatusDAO(mock.db).recordRefreshSuccess('app-1', 1_700_000_000);

    const sql = mock.only().sql;
    expect(sql).toContain('access_token_expires_at = excluded.access_token_expires_at');
    // Clearing on write rather than on read: a read that suppressed a stale error
    // would suppress it in the log too, and the two must never disagree about
    // whether the last attempt worked.
    expect(sql).toContain('last_error = NULL');
  });

  it('truncates an oversized failure reason rather than failing the write', async () => {
    // The stored reason is the only durable copy of *why* the refresh failed, and
    // it is read back through GET /user/processing/task-runs. A reason that does
    // not fit the column would otherwise fail the write that records it.
    const mock = createMockDb([{ success: true }]);

    await new OAuth2AccessTokenRefreshStatusDAO(mock.db).recordRefreshFailure('app-1', 'x'.repeat(5000));

    const recorded = mock.only().bindings.find((binding): binding is string => typeof binding === 'string' && binding.startsWith('xxx'));
    expect(recorded).toHaveLength(1024);
  });

  it('lists due applications, including the never-refreshed', async () => {
    // The `LEFT JOIN` + `IS NULL` branch is what makes an application that has
    // never been through a tick *due*. An inner join would exclude every freshly
    // connected mailbox and it would wait for the next scheduled refresh rather
    // than being refreshed by this one.
    const mock = createMockDb([{ results: [{ application_id: 'app-1' }] }]);

    const ids = await new OAuth2AccessTokenRefreshStatusDAO(mock.db).listDueApplicationIds(1_700_000_000, 25);

    const sql = mock.only().sql;
    expect(sql).toContain('LEFT JOIN oauth2_access_token_refresh_status');
    expect(sql).toContain('(status.access_token_expires_at IS NULL OR status.access_token_expires_at <= ?)');
    expect(sql).toContain('ORDER BY COALESCE(status.access_token_expires_at, 0) ASC');
    expect(mock.only().bindings).toEqual([CONNECTION_METHOD_OAUTH2, CONNECTED_APPLICATION_STATUS_CONNECTED, 1_700_000_000, 25]);
    expect(ids).toEqual(['app-1']);
  });

  it('maps a stored row onto the domain shape', async () => {
    const mock = createMockDb([
      {
        application_id: 'app-1',
        access_token_expires_at: 1_700_000_000,
        last_refresh_started_at: null,
        last_refresh_succeeded_at: 1_699_000_000,
        last_refresh_failed_at: null,
        last_error: null,
        created_at: 100,
        updated_at: 200,
      },
    ]);

    const status = await new OAuth2AccessTokenRefreshStatusDAO(mock.db).getByApplication('app-1');

    expect(status).toEqual({
      applicationId: 'app-1',
      accessTokenExpiresAt: 1_700_000_000,
      // A column that is NULL stays NULL rather than being coerced to a
      // zero-ish default: "never refreshed" and "refreshed at epoch" are
      // different facts.
      lastRefreshStartedAt: null,
      lastRefreshSucceededAt: 1_699_000_000,
      lastRefreshFailedAt: null,
      lastError: null,
      createdAt: 100,
      updatedAt: 200,
    });
  });

  it('reports no status for an application that has never been refreshed', async () => {
    const mock = createMockDb([null]);

    await expect(new OAuth2AccessTokenRefreshStatusDAO(mock.db).getByApplication('app-1')).resolves.toBeUndefined();
  });
});
