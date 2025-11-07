import { User, CreateUserRequest } from '@/model';

export class UserDAO {
  constructor(private db: D1Database) {}

  async create(userData: CreateUserRequest & { hashed_password: string }): Promise<User> {
    const result = await this.db
      .prepare('INSERT INTO users (email, hashed_password) VALUES (?, ?)')
      .bind(userData.email, userData.hashed_password)
      .run();

    if (!result.success) {
      throw new Error('Failed to create user');
    }

    return this.findById(result.meta.last_row_id as number) as Promise<User>;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
    return result || null;
  }

  async findById(id: number): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
    return result || null;
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE api_key = ?').bind(apiKey).first<User>();
    return result || null;
  }

  async updateApiKey(id: number, apiKey: string): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE users SET api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(apiKey, id)
      .run();
    return result.success && (result.meta.changes || 0) > 0;
  }

  async clearApiKey(id: number): Promise<boolean> {
    const result = await this.db.prepare('UPDATE users SET api_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
    return result.success && (result.meta.changes || 0) > 0;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return result.success && (result.meta.changes || 0) > 0;
  }
}
