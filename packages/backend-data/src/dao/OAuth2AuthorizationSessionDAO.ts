import { DatabaseError } from '@mail-meow/backend-errors';
import type { OAuth2AuthorizationSession, OAuth2AuthorizationSessionInternal } from '@mail-meow/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-meow/shared/utils';
import { executeD1WithRetry } from '../utils';
import { BaseDAO } from './BaseDAO';

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
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO oauth2_authorization_sessions
                (session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .bind(sessionId, applicationId, stateHash, codeVerifier, redirectUri, now, expiresAt)
          .run(),
      'create OAuth2 authorization session',
    );
    if (!result.success) {
      throw new DatabaseError(`Failed to create OAuth2 authorization session: ${result.error}`);
    }
  }

  public async getActive(applicationId: string, stateHash: string): Promise<OAuth2AuthorizationSession | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const row: OAuth2AuthorizationSessionInternal | null = await this.database
      .prepare(
        `
          SELECT session_id, application_id, state_hash, code_verifier, redirect_uri, created_at, expires_at, consumed_at
          FROM oauth2_authorization_sessions
          WHERE application_id = ? AND state_hash = ? AND expires_at > ? AND consumed_at IS NULL
          LIMIT 1
        `,
      )
      .bind(applicationId, stateHash, now)
      .first<OAuth2AuthorizationSessionInternal>();
    return row ? this.toSession(row) : undefined;
  }

  /**
   * Marks a session consumed and reports whether this caller won the race.
   *
   * The `consumed_at IS NULL` predicate alone is not enough: when two requests
   * present the same `state` concurrently, the loser's `UPDATE` still "succeeds"
   * — it simply matches zero rows. Only `meta.changes` distinguishes them, so a
   * caller that ignores it lets a replayed callback complete a second exchange.
   */
  public async consume(sessionId: string): Promise<boolean> {
    const consumedAt: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('UPDATE oauth2_authorization_sessions SET consumed_at = ? WHERE session_id = ? AND consumed_at IS NULL')
          .bind(consumedAt, sessionId)
          .run(),
      'consume OAuth2 authorization session',
    );
    if (!result.success) {
      throw new DatabaseError(`Failed to consume OAuth2 authorization session: ${result.error}`);
    }
    return (result.meta as { changes?: number } | undefined)?.changes === 1;
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
