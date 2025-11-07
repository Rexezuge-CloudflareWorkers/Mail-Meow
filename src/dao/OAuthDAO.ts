import { OAuth, OAuthRequest } from '@/model';

export class OAuthDAO {
  constructor(private db: D1Database) {}

  async create(data: OAuthRequest & { id: string; user_id: string }): Promise<OAuth> {
    const now = new Date().toISOString();
    const result = await this.db
      .prepare(
        'INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(data.id, data.user_id, data.provider, data.access_token, data.refresh_token, data.expires_at, now, now)
      .run();

    if (!result.success) {
      throw new Error('Failed to create OAuth token');
    }

    return {
      id: data.id,
      user_id: data.user_id,
      provider: data.provider,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      created_at: now,
      updated_at: now,
    };
  }

  async findByUserId(userId: string): Promise<OAuth | null> {
    const result = await this.db.prepare('SELECT * FROM oauth_tokens WHERE user_id = ?').bind(userId).first<OAuth>();
    return result || null;
  }

  async update(userId: string, data: Partial<OAuthRequest>): Promise<OAuth | null> {
    const now = new Date().toISOString();
    const result = await this.db
      .prepare(
        'UPDATE oauth_tokens SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = ? WHERE user_id = ?'
      )
      .bind(data.access_token, data.refresh_token, data.expires_at, now, userId)
      .run();

    if (!result.success) {
      throw new Error('Failed to update OAuth token');
    }

    return this.findByUserId(userId);
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM oauth_tokens WHERE user_id = ?').bind(userId).run();
    return result.success && result.changes > 0;
  }
}
