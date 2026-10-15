import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_OAUTH2 } from '@mail-meow/shared/constants';
import { TimestampUtil } from '@rexezuge/shared';
import { BaseDAO } from './BaseDAO';

const STATUS_COLUMNS =
  'application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at, last_refresh_failed_at, last_error, created_at, updated_at';

/**
 * Per-application OAuth2 token-refresh bookkeeping.
 *
 * Two things live here that are easy to mistake for redundant columns. The
 * `last_refresh_*` trio answers "what happened, when", which is what an operator
 * reads when a mailbox stops working; and `access_token_expires_at` is the
 * *learned* expiry, distinct from the token's own, because a provider that
 * returns no `expires_in` means "never expires" and must not be re-refreshed
 * every tick.
 *
 * Every `record*` method is an upsert, so the row and the transition are one
 * statement. That is what makes the three `record*` calls mutually exclusive by
 * construction rather than by the caller remembering.
 */
class OAuth2AccessTokenRefreshStatusDAO extends BaseDAO {
  public async getByApplication(applicationId: string): Promise<OAuth2AccessTokenRefreshStatus | undefined> {
    const row = await this.first<OAuth2AccessTokenRefreshStatusInternal>(
      `
        SELECT ${STATUS_COLUMNS}
        FROM oauth2_access_token_refresh_status
        WHERE application_id = ?
        LIMIT 1
      `,
      [applicationId],
    );
    return row ? this.toStatus(row) : undefined;
  }

  public async recordRefreshStarted(applicationId: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `
        INSERT INTO oauth2_access_token_refresh_status
          (application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at,
           last_refresh_failed_at, last_error, created_at, updated_at)
        VALUES (?, NULL, ?, NULL, NULL, NULL, ?, ?)
        ON CONFLICT(application_id) DO UPDATE SET
          last_refresh_started_at = excluded.last_refresh_started_at,
          updated_at = excluded.updated_at
      `,
      [applicationId, now, now, now],
    );
  }

  /**
   * Records the outcome and clears `last_error` in the same statement.
   *
   * Clearing the error on success rather than on read is deliberate: a read that
   * suppressed a stale error would also suppress it in the log, and the two must
   * never disagree about whether the last attempt worked.
   */
  public async recordRefreshSuccess(applicationId: string, accessTokenExpiresAt: number): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `
        INSERT INTO oauth2_access_token_refresh_status
          (application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at,
           last_refresh_failed_at, last_error, created_at, updated_at)
        VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?)
        ON CONFLICT(application_id) DO UPDATE SET
          access_token_expires_at = excluded.access_token_expires_at,
          last_refresh_succeeded_at = excluded.last_refresh_succeeded_at,
          last_error = NULL,
          updated_at = excluded.updated_at
      `,
      [applicationId, accessTokenExpiresAt, now, now, now],
    );
  }

  /**
   * Truncate the stored reason.
   *
   * The column has a length limit and a provider error can exceed it. Truncating
   * at the DAO is what keeps a single oversized message from failing the write
   * that records *why* the refresh failed — the row is the only durable copy of
   * that reason, and the operator reads it from `/user/processing/task-runs`.
   */
  public async recordRefreshFailure(applicationId: string, errorMessage: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `
        INSERT INTO oauth2_access_token_refresh_status
          (application_id, access_token_expires_at, last_refresh_started_at, last_refresh_succeeded_at,
           last_refresh_failed_at, last_error, created_at, updated_at)
        VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?)
        ON CONFLICT(application_id) DO UPDATE SET
          last_refresh_failed_at = excluded.last_refresh_failed_at,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `,
      [applicationId, now, errorMessage.slice(0, 1024), now, now],
    );
  }

  /**
   * Connected OAuth2 applications whose token is due for a refresh.
   *
   * The `LEFT JOIN` plus `IS NULL` branch is what makes a never-refreshed
   * application due. An inner join would silently exclude every application that
   * had not yet been through one tick, so a freshly connected mailbox would
   * wait for its first scheduled refresh rather than being refreshed by it.
   *
   * Ordered by the learned expiry with `0` for the never-refreshed, so the
   * longest-idle application goes first rather than whichever row D1 returns.
   */
  public async listDueApplicationIds(refreshBefore: number, limit: number): Promise<string[]> {
    const rows = await this.all<{ application_id: string }>(
      `
        SELECT ca.application_id
        FROM connected_applications ca
        LEFT JOIN oauth2_access_token_refresh_status status ON status.application_id = ca.application_id
        WHERE ca.connection_method = ?
          AND ca.status = ?
          AND (status.access_token_expires_at IS NULL OR status.access_token_expires_at <= ?)
        ORDER BY COALESCE(status.access_token_expires_at, 0) ASC, ca.updated_at ASC
        LIMIT ?
      `,
      [CONNECTION_METHOD_OAUTH2, CONNECTED_APPLICATION_STATUS_CONNECTED, refreshBefore, limit],
    );
    return rows.map((row: { application_id: string }): string => row.application_id);
  }

  private toStatus(row: OAuth2AccessTokenRefreshStatusInternal): OAuth2AccessTokenRefreshStatus {
    return {
      applicationId: row.application_id,
      accessTokenExpiresAt: row.access_token_expires_at,
      lastRefreshStartedAt: row.last_refresh_started_at,
      lastRefreshSucceededAt: row.last_refresh_succeeded_at,
      lastRefreshFailedAt: row.last_refresh_failed_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface OAuth2AccessTokenRefreshStatus {
  applicationId: string;
  accessTokenExpiresAt?: number | null;
  lastRefreshStartedAt?: number | null;
  lastRefreshSucceededAt?: number | null;
  lastRefreshFailedAt?: number | null;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface OAuth2AccessTokenRefreshStatusInternal {
  application_id: string;
  access_token_expires_at: number | null;
  last_refresh_started_at: number | null;
  last_refresh_succeeded_at: number | null;
  last_refresh_failed_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export { OAuth2AccessTokenRefreshStatusDAO };
export type { OAuth2AccessTokenRefreshStatus };
