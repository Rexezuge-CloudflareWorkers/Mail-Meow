import type { OAuth2AuthorizationSession, OAuth2AuthorizationSessionInternal } from '@mail-meow/shared/model';
import { TimestampUtil, UUIDUtil } from '@rexezuge/shared';
import { BaseDAO } from './BaseDAO';

const SESSION_COLUMNS = 'session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at, consumed_at';

/**
 * One-time PKCE authorization sessions.
 *
 * The whole class exists to make a `state` value single-use. Everything else is
 * bookkeeping, and the one part that has to be exactly right is
 * {@link consume}.
 */
class OAuth2AuthorizationSessionDAO extends BaseDAO {
  public async create(
    applicationId: string,
    stateHash: string,
    codeVerifier: string,
    redirectUri: string,
    expiresAt: number,
  ): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const sessionId: string = UUIDUtil.getRandomUUID();
    await this.run(
      `
        INSERT INTO oauth2_authorization_sessions
          (session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [sessionId, applicationId, stateHash, codeVerifier, redirectUri, now, expiresAt],
    );
  }

  /**
   * The unconsumed, unexpired session a presented `state` identifies.
   *
   * `undefined` rather than `null` for "no session": the caller distinguishes
   * "unknown or expired" from "no session" nowhere, and `undefined` is what this
   * method's callers already read. The kit's `first()` returns `null` for a
   * missing row, and the adapter is this line.
   */
  public async getActive(applicationId: string, stateHash: string): Promise<OAuth2AuthorizationSession | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const row = await this.first<OAuth2AuthorizationSessionInternal>(
      `
        SELECT ${SESSION_COLUMNS}
        FROM oauth2_authorization_sessions
        WHERE application_id = ? AND state_hash = ? AND expires_at > ? AND consumed_at IS NULL
        LIMIT 1
      `,
      [applicationId, stateHash, now],
    );
    return row ? this.toSession(row) : undefined;
  }

  /**
   * Marks a session consumed and reports whether this caller won the race.
   *
   * The `consumed_at IS NULL` predicate alone is not enough: when two requests
   * present the same `state` concurrently, the loser's `UPDATE` still "succeeds"
   * — it simply matches zero rows. Only `meta.changes` distinguishes them, so a
   * caller that ignores it lets a replayed callback complete a second exchange.
   *
   * This is why the DAO returns `boolean` rather than `void`: `success: true`
   * from D1 means the statement ran, not that it claimed a row.
   */
  public async consume(sessionId: string): Promise<boolean> {
    const consumedAt: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result = await this.run('UPDATE oauth2_authorization_sessions SET consumed_at = ? WHERE session_id = ? AND consumed_at IS NULL', [
      consumedAt,
      sessionId,
    ]);
    return result.meta?.changes === 1;
  }

  private toSession(row: OAuth2AuthorizationSessionInternal): OAuth2AuthorizationSession {
    return {
      sessionId: row.session_id,
      applicationId: row.application_id,
      stateHash: row.state_hash,
      codeVerifier: row.code_verifier,
      redirectUri: row.redirect_uri,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }
}

export { OAuth2AuthorizationSessionDAO };
