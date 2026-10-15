import { DatabaseError } from '@rexezuge/errors';
import type { ApplicationApiKeyInternal, ApplicationApiKeyMetadata } from '@mail-meow/shared/model';
import { TimestampUtil, UUIDUtil } from '@rexezuge/shared';
import { BaseDAO } from './BaseDAO';

const KEY_COLUMNS = 'api_key_id, application_id, key_hash, name, key_prefix, key_last_four, created_at, expires_at, last_used_at';

/**
 * API keys for a connected application.
 *
 * Only the hash is ever stored. `key_prefix` and `key_last_four` are carried
 * alongside it so the UI can list a key the operator no longer holds — the first
 * and last four characters are enough to recognise one in a list and useless
 * for authenticating with.
 *
 * Every write is a bare `.run()` because `BaseDAO.run` already normalizes
 * `success: false` into a `DatabaseError` carrying the retry verdict. The
 * previous closure-first form needed the same normalization spelled out at each
 * site, and the sites that skipped it defaulted `retryable` to `false`.
 */
class ApplicationApiKeyDAO extends BaseDAO {
  public async create(
    applicationId: string,
    keyHash: string,
    name: string,
    keyPrefix: string,
    keyLastFour: string,
    expiresAt: number,
  ): Promise<ApplicationApiKeyMetadata> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const apiKeyId: string = UUIDUtil.getRandomUUID();
    await this.run(
      `
        INSERT INTO application_api_keys
          (api_key_id, application_id, key_hash, name, key_prefix, key_last_four, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [apiKeyId, applicationId, keyHash, name, keyPrefix, keyLastFour, now, expiresAt],
    );
    const key: ApplicationApiKeyMetadata | undefined = await this.getById(apiKeyId);
    if (!key) {
      throw new DatabaseError('Failed to load API key after create.');
    }
    return key;
  }

  /**
   * Resolve a presented key to the record it identifies.
   *
   * `activeOnly` is folded into the SQL rather than checked afterwards, because
   * an expired key must not be *found* and then rejected: a caller that logs the
   * record it found has already leaked that the key exists.
   */
  public async getByHash(keyHash: string, activeOnly: boolean): Promise<ApplicationApiKeyMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    // The filter and its binding are built together so the two can never drift.
    const activeFilter: string = activeOnly ? ' AND expires_at > ?' : '';
    const bindings: unknown[] = activeOnly ? [keyHash, now] : [keyHash];
    const row = await this.first<ApplicationApiKeyInternal>(
      `
        SELECT ${KEY_COLUMNS}
        FROM application_api_keys
        WHERE key_hash = ?${activeFilter}
        LIMIT 1
      `,
      bindings,
    );
    return row ? this.toMetadata(row) : undefined;
  }

  public async getById(apiKeyId: string): Promise<ApplicationApiKeyMetadata | undefined> {
    const row = await this.first<ApplicationApiKeyInternal>(
      `
        SELECT ${KEY_COLUMNS}
        FROM application_api_keys
        WHERE api_key_id = ?
        LIMIT 1
      `,
      [apiKeyId],
    );
    return row ? this.toMetadata(row) : undefined;
  }

  public async listByApplication(applicationId: string): Promise<ApplicationApiKeyMetadata[]> {
    const rows = await this.all<ApplicationApiKeyInternal>(
      `
        SELECT ${KEY_COLUMNS}
        FROM application_api_keys
        WHERE application_id = ?
        ORDER BY created_at DESC
      `,
      [applicationId],
    );
    return rows.map((row: ApplicationApiKeyInternal): ApplicationApiKeyMetadata => this.toMetadata(row));
  }

  public async countByApplication(applicationId: string): Promise<number> {
    return this.count('SELECT COUNT(*) AS count FROM application_api_keys WHERE application_id = ?', [applicationId]);
  }

  /**
   * Stamp last-used. Best-effort by design: this runs on the hot path of every
   * public delivery request, and a failure to record a timestamp is not a reason
   * to fail a send that already succeeded. The write is still retried, because
   * "best-effort" is about the *outcome*, not about giving up on the attempt.
   */
  public async updateLastUsed(apiKeyId: string): Promise<void> {
    const lastUsedAt: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run('UPDATE application_api_keys SET last_used_at = ? WHERE api_key_id = ?', [lastUsedAt, apiKeyId]);
  }

  /**
   * Delete a key, scoped to its application.
   *
   * The `application_id` predicate is what makes this safe to expose as a
   * user-facing DELETE: without it a caller who guessed another application's
   * key id would delete a key they do not own, and the response would be an
   * indistinguishable 404 either way.
   */
  public async deleteForApplication(apiKeyId: string, applicationId: string): Promise<void> {
    await this.run('DELETE FROM application_api_keys WHERE api_key_id = ? AND application_id = ?', [apiKeyId, applicationId]);
  }

  private toMetadata(row: ApplicationApiKeyInternal): ApplicationApiKeyMetadata {
    return {
      apiKeyId: row.api_key_id,
      applicationId: row.application_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      keyLastFour: row.key_last_four,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
    };
  }
}

export { ApplicationApiKeyDAO };
