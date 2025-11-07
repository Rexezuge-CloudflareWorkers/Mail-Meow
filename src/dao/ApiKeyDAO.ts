import { ApiKey } from '@/model';

export class ApiKeyDAO {
  constructor(private db: D1Database) {}

  async create(data: { id: string; user_id: string; api_key: string }): Promise<ApiKey> {
    const now = new Date().toISOString();
    const result = await this.db
      .prepare('INSERT INTO api_keys (id, user_id, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(data.id, data.user_id, data.api_key, now, now)
      .run();

    if (!result.success) {
      throw new Error('Failed to create API key');
    }

    return {
      id: data.id,
      user_id: data.user_id,
      api_key: data.api_key,
      created_at: now,
      updated_at: now,
    };
  }

  async findByApiKey(apiKey: string): Promise<ApiKey | null> {
    const result = await this.db.prepare('SELECT * FROM api_keys WHERE api_key = ?').bind(apiKey).first<ApiKey>();
    return result || null;
  }

  async findByUserId(userId: string): Promise<ApiKey[]> {
    const result = await this.db.prepare('SELECT * FROM api_keys WHERE user_id = ?').bind(userId).all<ApiKey>();
    return result.results || [];
  }

  async delete(apiKey: string): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM api_keys WHERE api_key = ?').bind(apiKey).run();
    return result.success && result.changes > 0;
  }
}
