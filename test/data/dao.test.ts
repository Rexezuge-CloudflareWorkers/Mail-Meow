import { describe, expect, it, vi } from 'vitest';
import {
  ApplicationApiKeyDAO,
  BackgroundTaskRunDAO,
  BaseDAO,
  ConnectedApplicationDAO,
  OAuth2AuthorizationSessionDAO,
  UserDAO,
} from '@mail-meow/backend-data/dao';
import { DatabaseError } from '@mail-meow/backend-errors';
import { createFailingDb, createMockDb } from '../helpers/mockDb';
import { encryptData } from '@mail-meow/backend-data/crypto';

const MASTER_KEY = btoa('k'.repeat(32));

const APPLICATION_ROW = {
  application_id: 'app-1',
  user_email: 'me@example.com',
  display_name: 'My App',
  provider_id: 'google-gmail',
  connection_method: 'oauth2',
  encrypted_credentials: 'cipher',
  credentials_iv: 'iv',
  status: 'connected',
  created_at: 100,
  updated_at: 200,
};

const KEY_ROW = {
  api_key_id: 'key-1',
  application_id: 'app-1',
  key_hash: 'hash',
  name: 'CI',
  key_prefix: 'mm_test',
  key_last_four: 'abcd',
  created_at: 100,
  expires_at: 9_999_999_999,
  last_used_at: null,
};

const SESSION_ROW = {
  session_id: 'sess-1',
  application_id: 'app-1',
  state_hash: 'state-hash',
  code_verifier: 'verifier',
  redirect_uri: 'https://example.com/cb',
  created_at: 100,
  expires_at: 9_999_999_999,
  consumed_at: null,
};

describe('ConnectedApplicationDAO', () => {
  it('binds every value in the insert', async () => {
    const mock = createMockDb([APPLICATION_ROW]);
    const dao = new ConnectedApplicationDAO(mock.db, MASTER_KEY);

    await dao.create('me@example.com', 'My App', 'google-gmail', 'oauth2', { clientId: 'a', clientSecret: 'b' }, 'draft');

    const insert = mock.statements[0];
    expect(insert.sql).toContain('INSERT INTO connected_applications');
    // Values must be bound, never interpolated into the SQL text.
    expect(insert.bindings).toContain('me@example.com');
    expect(insert.sql).not.toContain('me@example.com');
  });

  it('maps a row to domain metadata', () => {
    const dao = new ConnectedApplicationDAO(createMockDb().db, MASTER_KEY);
    const mapped = (dao as unknown as { toMetadata(row: typeof APPLICATION_ROW): { status: string } }).toMetadata(APPLICATION_ROW);
    expect(mapped.status).toBe('connected');
  });

  it('throws on an unrecognized status instead of coercing it to draft', () => {
    const dao = new ConnectedApplicationDAO(createMockDb().db, MASTER_KEY);
    // A corrupt row used to be silently relabelled `draft`, hiding the signal
    // behind an apparently healthy application.
    expect(() => (dao as unknown as { toMetadata(row: unknown): unknown }).toMetadata({ ...APPLICATION_ROW, status: 'bogus' })).toThrow(
      DatabaseError,
    );
  });

  it('lists a user applications newest first', async () => {
    const mock = createMockDb([[APPLICATION_ROW]]);
    const dao = new ConnectedApplicationDAO(mock.db, MASTER_KEY);

    const list = await dao.listMetadataByUserEmail('me@example.com');

    expect(list).toHaveLength(1);
    expect(list[0].applicationId).toBe('app-1');
    expect(mock.only().sql).toContain('ORDER BY updated_at DESC, created_at DESC');
    expect(mock.only().bindings).toEqual(['me@example.com']);
  });

  it('scopes a lookup by user when an email is supplied', async () => {
    const mock = createMockDb([APPLICATION_ROW]);
    const dao = new ConnectedApplicationDAO(mock.db, MASTER_KEY);

    await dao.getMetadataByIdForUser('app-1', 'me@example.com');

    const statement = mock.only();
    expect(statement.sql).toContain('user_email = ?');
    expect(statement.bindings).toEqual(['app-1', 'me@example.com']);
  });

  it('omits the ownership predicate when no email is supplied', async () => {
    const mock = createMockDb([APPLICATION_ROW]);
    const dao = new ConnectedApplicationDAO(mock.db, MASTER_KEY);

    await dao.getMetadataByIdForUser('app-1', undefined as unknown as string);

    expect(mock.only().sql).not.toContain('user_email = ?');
  });

  it('returns undefined for a missing row', async () => {
    const dao = new ConnectedApplicationDAO(createMockDb([null]).db, MASTER_KEY);
    await expect(dao.getMetadataByIdForUser('nope', 'me@example.com')).resolves.toBeUndefined();
  });

  it('decrypts credentials when loading a full application', async () => {
    const encrypted = await encryptData(JSON.stringify({ clientId: 'a', clientSecret: 'b' }), MASTER_KEY);
    const mock = createMockDb([{ ...APPLICATION_ROW, encrypted_credentials: encrypted.encrypted, credentials_iv: encrypted.iv }]);
    const dao = new ConnectedApplicationDAO(mock.db, MASTER_KEY);

    const application = await dao.getById('app-1');

    expect(application?.credentials).toEqual({ clientId: 'a', clientSecret: 'b' });
  });

  it('counts applications for a user', async () => {
    const mock = createMockDb([{ count: 3 }]);
    const dao = new ConnectedApplicationDAO(mock.db, MASTER_KEY);

    await expect(dao.countByUserEmail('me@example.com')).resolves.toBe(3);
  });

  it('refuses to mark a non-OAuth2 application connected', async () => {
    const encrypted = await encryptData(JSON.stringify({ accessKeyId: 'a' }), MASTER_KEY);
    const mock = createMockDb([
      { ...APPLICATION_ROW, connection_method: 'access-keys', encrypted_credentials: encrypted.encrypted, credentials_iv: encrypted.iv },
    ]);
    const dao = new ConnectedApplicationDAO(mock.db, MASTER_KEY);

    await expect(dao.markOAuth2Connected('app-1', 'refresh')).rejects.toBeInstanceOf(DatabaseError);
    // Must not have issued the status update.
    expect(mock.statements.every((s) => !s.sql.includes('SET encrypted_credentials'))).toBe(true);
  });

  it('ignores a refresh-token update for a non-OAuth2 application', async () => {
    const encrypted = await encryptData(JSON.stringify({ accessKeyId: 'a' }), MASTER_KEY);
    const mock = createMockDb([
      { ...APPLICATION_ROW, connection_method: 'access-keys', encrypted_credentials: encrypted.encrypted, credentials_iv: encrypted.iv },
    ]);

    await new ConnectedApplicationDAO(mock.db, MASTER_KEY).updateOAuth2RefreshToken('app-1', 'refresh');

    expect(mock.statements.every((s) => !s.sql.includes('UPDATE connected_applications'))).toBe(true);
  });

  it('scopes a delete to the owner', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    const dao = new ConnectedApplicationDAO(mock.db, MASTER_KEY);

    await dao.deleteForUser('app-1', 'me@example.com');

    const statement = mock.only();
    expect(statement.sql).toContain('user_email = ?');
    expect(statement.bindings).toEqual(['app-1', 'me@example.com']);
  });
});

describe('ApplicationApiKeyDAO', () => {
  it('reuses one column list across its queries', async () => {
    const mock = createMockDb([[KEY_ROW]]);
    const dao = new ApplicationApiKeyDAO(mock.db);

    await dao.listByApplication('app-1');

    expect(mock.only().sql).toContain('api_key_id, application_id, key_hash');
  });

  it('adds the expiry filter and its binding together', async () => {
    const active = createMockDb([KEY_ROW]);
    await new ApplicationApiKeyDAO(active.db).getByHash('hash', true);
    expect(active.only().sql).toContain('expires_at > ?');
    // A filter without its binding would silently compare against nothing.
    expect(active.only().bindings).toHaveLength(2);

    const all = createMockDb([KEY_ROW]);
    await new ApplicationApiKeyDAO(all.db).getByHash('hash', false);
    expect(all.only().sql).not.toContain('expires_at > ?');
    expect(all.only().bindings).toHaveLength(1);
  });

  it('maps a row to metadata', () => {
    const dao = new ApplicationApiKeyDAO(createMockDb().db);
    const mapped = (dao as unknown as { toMetadata(row: typeof KEY_ROW): { apiKeyId: string } }).toMetadata(KEY_ROW);
    expect(mapped.apiKeyId).toBe('key-1');
  });

  it('throws when the row cannot be loaded after a create', async () => {
    // A create that reports success but yields no row is a real inconsistency.
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }, null]);
    const dao = new ApplicationApiKeyDAO(mock.db);

    await expect(dao.create('app-1', 'hash', 'CI', 'mm_', 'abcd', 1)).rejects.toThrow(/Failed to load API key after create/);
    expect(mock.statements).toHaveLength(2);
  });

  it('records last-used on a key update', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    const dao = new ApplicationApiKeyDAO(mock.db);

    await dao.updateLastUsed('key-1');

    expect(mock.only().sql).toContain('SET last_used_at = ?');
  });

  it('scopes a delete to the application', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    const dao = new ApplicationApiKeyDAO(mock.db);

    await dao.deleteForApplication('key-1', 'app-1');

    expect(mock.only().bindings).toEqual(['key-1', 'app-1']);
  });

  it('returns zero when a count query finds nothing', async () => {
    await expect(new ApplicationApiKeyDAO(createMockDb([null]).db).countByApplication('app-1')).resolves.toBe(0);
  });
});

describe('OAuth2AuthorizationSessionDAO', () => {
  it('creates a session with all seven bound values', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    const dao = new OAuth2AuthorizationSessionDAO(mock.db);

    await dao.create('app-1', 'state-hash', 'verifier', 'https://example.com/cb', 9_999_999_999);

    expect(mock.only().bindings).toHaveLength(7);
  });

  it('only returns a session that is unexpired and unconsumed', async () => {
    const mock = createMockDb([SESSION_ROW]);
    const dao = new OAuth2AuthorizationSessionDAO(mock.db);

    const session = await dao.getActive('app-1', 'state-hash');

    expect(session?.sessionId).toBe('sess-1');
    const statement = mock.only();
    expect(statement.sql).toContain('expires_at > ?');
    expect(statement.sql).toContain('consumed_at IS NULL');
  });

  it('reports whether this caller won the consume race', async () => {
    // Both racers' UPDATEs "succeed"; only meta.changes tells them apart. Without
    // this, a replayed callback was told it had consumed the session.
    const winner = new OAuth2AuthorizationSessionDAO(createMockDb([{ success: true, meta: { changes: 1 } }]).db);
    const loser = new OAuth2AuthorizationSessionDAO(createMockDb([{ success: true, meta: { changes: 0 } }]).db);

    await expect(winner.consume('sess-1')).resolves.toBe(true);
    await expect(loser.consume('sess-1')).resolves.toBe(false);
  });

  it('treats an absent change count as a lost race rather than a win', async () => {
    const dao = new OAuth2AuthorizationSessionDAO(createMockDb([{ success: true, meta: {} }]).db);
    await expect(dao.consume('sess-1')).resolves.toBe(false);
  });

  it('throws when the consume statement fails outright', async () => {
    const dao = new OAuth2AuthorizationSessionDAO(createFailingDb('D1_ERROR: timeout') as never);
    await expect(dao.consume('sess-1')).rejects.toBeInstanceOf(DatabaseError);
  });

  it('maps every column of the session row', () => {
    const dao = new OAuth2AuthorizationSessionDAO(createMockDb().db);
    const mapped = (dao as unknown as { toSession(row: typeof SESSION_ROW): { redirectUri: string } }).toSession(SESSION_ROW);
    expect(mapped.redirectUri).toBe('https://example.com/cb');
  });
});

describe('UserDAO', () => {
  it('upserts by email', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    const dao = new UserDAO(mock.db);

    await dao.upsertByEmail('me@example.com');

    // upsert is INSERT ... ON CONFLICT, issued as a single bound statement.
    expect(mock.statementAt(0).bindings).toContain('me@example.com');
    expect(mock.statementAt(0).sql).not.toContain('me@example.com');
  });

  it('reads the preferred language', async () => {
    const mock = createMockDb([{ email: 'me@example.com', preferred_language: 'de' }]);
    const dao = new UserDAO(mock.db);

    await expect(dao.getByEmail('me@example.com')).resolves.toMatchObject({ preferredLanguage: 'de' });
  });

  it('returns undefined for an unknown email', async () => {
    await expect(new UserDAO(createMockDb([null]).db).getByEmail('nope@example.com')).resolves.toBeUndefined();
  });

  it('updates the preferred language', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    const dao = new UserDAO(mock.db);

    await dao.updatePreferredLanguage('me@example.com', 'fr');

    expect(mock.statementAt(0).sql).toContain('preferred_language');
    expect(mock.statementAt(0).bindings).toContain('fr');
  });
});

describe('BackgroundTaskRunDAO', () => {
  const RUN_ROW = {
    run_id: 'run-1',
    task_type: 'oauth2_refresh',
    application_id: 'app-1',
    user_email: 'me@example.com',
    status: 'success',
    summary: 'ok',
    details: null,
    items_processed: 1,
    items_failed: 0,
    started_at: 100,
    completed_at: 200,
  };

  it('clamps the page size into the supported range', async () => {
    const mock = createMockDb([[RUN_ROW]]);
    const dao = new BackgroundTaskRunDAO(mock.db);

    await dao.listForUser('me@example.com', { limit: 5_000 });

    // Clamped to 50, then bound as limit+1 to detect a further page.
    expect(mock.statementAt(0).bindings).toContain(51);
  });

  it('raises the floor of the page size', async () => {
    const mock = createMockDb([[RUN_ROW]]);
    await new BackgroundTaskRunDAO(mock.db).listForUser('me@example.com', { limit: 0 });
    expect(mock.statementAt(0).bindings).toContain(2);
  });

  it('fetches one extra row to detect a further page', async () => {
    const mock = createMockDb([[RUN_ROW]]);
    const result = await new BackgroundTaskRunDAO(mock.db).listForUser('me@example.com', { limit: 25 });

    expect(mock.statementAt(0).bindings).toContain(26);
    expect(result.runs).toHaveLength(1);
  });

  it('filters by task type when asked', async () => {
    const mock = createMockDb([[RUN_ROW]]);
    await new BackgroundTaskRunDAO(mock.db).listForUser('me@example.com', { taskType: 'oauth2_refresh' });

    expect(mock.only().sql).toContain('task_type = ?');
    expect(mock.only().bindings).toContain('oauth2_refresh');
  });

  it('starts a run and reports the new id', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    const dao = new BackgroundTaskRunDAO(mock.db);

    const runId = await dao.startRun({ taskType: 'oauth2_refresh' });

    expect(runId).toBeTruthy();
    expect(mock.statements.some((s) => s.sql.includes('INSERT INTO background_task_runs'))).toBe(true);
  });

  it('records a success terminal state', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    await new BackgroundTaskRunDAO(mock.db).succeedRun('run-1', { itemsProcessed: 3, itemsFailed: 0 });
    expect(mock.statementAt(0).bindings).toContain('success');
  });

  it('downgrades a partially successful run', async () => {
    // A run with failures is not a success, and reporting it as one hides a
    // broken cron from the task-run view.
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    await new BackgroundTaskRunDAO(mock.db).succeedRun('run-1', { itemsProcessed: 3, itemsFailed: 1 });
    expect(mock.statementAt(0).bindings).toContain('partial_success');
  });

  it('records an error terminal state', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    await new BackgroundTaskRunDAO(mock.db).failRun('run-1', 'boom');
    expect(mock.statementAt(0).sql).toContain("status = 'error'");
    expect(mock.statementAt(0).bindings).toContain('boom');
  });

  it('records a skipped terminal state', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 1 } }]);
    await new BackgroundTaskRunDAO(mock.db).skipRun('run-1', 'nothing to do');
    expect(mock.statementAt(0).sql).toContain("status = 'skipped'");
  });

  it('excludes running rows from pruning', async () => {
    // The predicate was `started_at < ?` alone, so a still-running row could be
    // deleted out from under its own task.
    const mock = createMockDb([{ success: true, meta: { changes: 2 } }]);
    const dao = new BackgroundTaskRunDAO(mock.db);

    const deleted = await dao.pruneOldRuns(1, 100);

    expect(deleted).toBe(2);
    expect(mock.only().sql).toContain("status != 'running'");
    expect(mock.only().sql).toContain('ORDER BY started_at');
  });

  it('prunes nothing when the statement reports no changes', async () => {
    const mock = createMockDb([{ success: true, meta: { changes: 0 } }]);
    await expect(new BackgroundTaskRunDAO(mock.db).pruneOldRuns(1, 100)).resolves.toBe(0);
  });
});

describe('BaseDAO.findById', () => {
  it('interpolates an allow-listed table and column', async () => {
    const mock = createMockDb([{ id: 1 }]);

    const row = await BaseDAO.findById(mock.db, 'users', 'email', 'me@example.com');

    expect(row).toEqual({ id: 1 });
    expect(mock.only().sql).toContain('FROM users WHERE email = ?');
  });

  it('rejects a table name that is not a bare identifier', async () => {
    // Dynamic SQL may only vary by identifier; this is the guard that keeps that
    // true when a caller passes a caller-influenced value.
    const mock = createMockDb();
    await expect(BaseDAO.findById(mock.db, 'users; DROP TABLE users', 'id', 'x')).rejects.toThrow(/Invalid SQL identifier/);
    expect(mock.statements).toHaveLength(0);
  });

  it('rejects a column list containing a non-identifier', async () => {
    const mock = createMockDb();
    await expect(BaseDAO.findById(mock.db, 'users', 'id', 'x', 'id, (SELECT 1)')).rejects.toThrow(/Invalid SQL identifier/);
  });

  it('validates and joins an explicit column list', async () => {
    const mock = createMockDb([null]);
    await BaseDAO.findById(mock.db, 'users', 'id', 'x', ' id , email ');
    expect(mock.only().sql).toContain('SELECT id, email FROM users');
  });

  it('returns null for a missing row', async () => {
    await expect(BaseDAO.findById(createMockDb([null]).db, 'users', 'id', 'x')).resolves.toBeNull();
  });
});
