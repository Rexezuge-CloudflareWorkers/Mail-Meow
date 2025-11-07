import { OAuth, OAuthRequest } from '@/model';

export class OAuthDAO {
  constructor(private db: D1Database) {}

  async create(data: OAuthRequest & { user_id: number }): Promise<OAuth> {
    const result = await this.db
      .prepare('INSERT INTO oauth (user_id, provider, client_id, client_secret, refresh_token) VALUES (?, ?, ?, ?, ?)')
      .bind(data.user_id, data.provider, data.client_id, data.client_secret, data.refresh_token)
      .run();

    if (!result.success) {
      throw new Error('Failed to create OAuth');
    }

    return this.findById(result.meta.last_row_id as number) as Promise<OAuth>;
  }

  async findById(id: number): Promise<OAuth | null> {
    const result = await this.db.prepare('SELECT * FROM oauth WHERE id = ?').bind(id).first<OAuth>();
    return result || null;
  }

  async findByUserId(userId: number): Promise<OAuth[]> {
    const result = await this.db.prepare('SELECT * FROM oauth WHERE user_id = ?').bind(userId).all<OAuth>();
    return result.results || [];
  }

  async findByUserIdAndProvider(userId: number, provider: string): Promise<OAuth | null> {
    const result = await this.db.prepare('SELECT * FROM oauth WHERE user_id = ? AND provider = ?').bind(userId, provider).first<OAuth>();
    return result || null;
  }

  async update(id: number, data: Partial<OAuthRequest>): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE oauth SET client_id = ?, client_secret = ?, refresh_token = ? WHERE id = ?')
      .bind(data.client_id, data.client_secret, data.refresh_token, id)
      .run();
    return result.success && (result.meta.changes || 0) > 0;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM oauth WHERE id = ?').bind(id).run();
    return result.success && (result.meta.changes || 0) > 0;
  }

  async deleteByUserIdAndProvider(userId: number, provider: string): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM oauth WHERE user_id = ? AND provider = ?').bind(userId, provider).run();
    return result.success && (result.meta.changes || 0) > 0;
  }
}
