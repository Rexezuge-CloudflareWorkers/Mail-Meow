import { User, CreateUserRequest } from '@/model';

export class UserDAO {
  constructor(private db: D1Database) {}

  async create(userData: CreateUserRequest & { id: string; password_hash: string }): Promise<User> {
    const now = new Date().toISOString();
    const result = await this.db
      .prepare('INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userData.id, userData.email, userData.password_hash, now, now)
      .run();

    if (!result.success) {
      throw new Error('Failed to create user');
    }

    return {
      id: userData.id,
      email: userData.email,
      password_hash: userData.password_hash,
      created_at: now,
      updated_at: now,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
    return result || null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
    return result || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return result.success && result.changes > 0;
  }
}
