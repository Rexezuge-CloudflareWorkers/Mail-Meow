import { DatabaseError } from '@/error';
import type { ApplicationApiKeyMetadata, ApplicationApiKeyInternal } from '@mail-meow/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-meow/shared/utils';

class ApplicationApiKeyDAO {
  protected readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

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
    const result: D1Result = await this.database
      .prepare(
        `
          INSERT INTO application_api_keys
            (api_key_id, application_id, key_hash, name, key_prefix, key_last_four, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(apiKeyId, applicationId, keyHash, name, keyPrefix, keyLastFour, now, expiresAt)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to create API key: ${result.error}`);
    }
    const key: ApplicationApiKeyMetadata | undefined = await this.getById(apiKeyId);
    if (!key) {
      throw new DatabaseError('Failed to load API key after create.');
    }
    return key;
  }

  public async getByHash(keyHash: string, activeOnly: boolean): Promise<ApplicationApiKeyMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const activeFilter: string = activeOnly ? ' AND expires_at > ?' : '';
    const bindings: unknown[] = activeOnly ? [keyHash, now] : [keyHash];
    const row: ApplicationApiKeyInternal | null = await this.database
      .prepare(
        `
          SELECT api_key_id, application_id, key_hash, name, key_prefix, key_last_four, created_at, expires_at, last_used_at
          FROM application_api_keys
          WHERE key_hash = ?${activeFilter}
          LIMIT 1
        `,
      )
      .bind(...bindings)
      .first<ApplicationApiKeyInternal>();
    return row ? this.toMetadata(row) : undefined;
  }

  public async getById(apiKeyId: string): Promise<ApplicationApiKeyMetadata | undefined> {
    const row: ApplicationApiKeyInternal | null = await this.database
      .prepare(
        `
          SELECT api_key_id, application_id, key_hash, name, key_prefix, key_last_four, created_at, expires_at, last_used_at
          FROM application_api_keys
          WHERE api_key_id = ?
          LIMIT 1
        `,
      )
      .bind(apiKeyId)
      .first<ApplicationApiKeyInternal>();
    return row ? this.toMetadata(row) : undefined;
  }

  public async listByApplication(applicationId: string): Promise<ApplicationApiKeyMetadata[]> {
    const rows: ApplicationApiKeyInternal[] = await this.database
      .prepare(
        `
          SELECT api_key_id, application_id, key_hash, name, key_prefix, key_last_four, created_at, expires_at, last_used_at
          FROM application_api_keys
          WHERE application_id = ?
          ORDER BY created_at DESC
        `,
      )
      .bind(applicationId)
      .all<ApplicationApiKeyInternal>()
      .then((result: D1Result<ApplicationApiKeyInternal>): ApplicationApiKeyInternal[] => result.results || []);
    return rows.map((row: ApplicationApiKeyInternal): ApplicationApiKeyMetadata => this.toMetadata(row));
  }

  public async countByApplication(applicationId: string): Promise<number> {
    const row: { count: number } | null = await this.database
      .prepare('SELECT COUNT(*) AS count FROM application_api_keys WHERE application_id = ?')
      .bind(applicationId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  public async updateLastUsed(apiKeyId: string): Promise<void> {
    const lastUsedAt: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare('UPDATE application_api_keys SET last_used_at = ? WHERE api_key_id = ?')
      .bind(lastUsedAt, apiKeyId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to update API key last-used timestamp: ${result.error}`);
    }
  }

  public async deleteForApplication(apiKeyId: string, applicationId: string): Promise<void> {
    const result: D1Result = await this.database
      .prepare('DELETE FROM application_api_keys WHERE api_key_id = ? AND application_id = ?')
      .bind(apiKeyId, applicationId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to delete API key: ${result.error}`);
    }
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
