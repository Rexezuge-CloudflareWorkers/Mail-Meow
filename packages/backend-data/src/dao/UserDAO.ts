import { executeD1WithRetry } from '../utils';
import type { AccountIdentity, User, UserInternal } from '@mail-meow/shared/model';
import { normalizeEmail, TimestampUtil } from '@mail-meow/shared/utils';
import { BaseDAO } from './BaseDAO';

const UPDATE_BY_ID = 'UPDATE users SET preferred_language = ?, updated_at = ? WHERE id = ?';
const UPDATE_BY_ANCHOR = 'UPDATE users SET preferred_language = ?, updated_at = ? WHERE email = ?';

/**
 * Opaque hex token, e.g. `a1b2c3…`.
 *
 * Uses the platform CSPRNG rather than `UUIDUtil` because the value is an
 * internal identifier with no v4 layout requirement, and because a UUID's
 * version/variant bits would make a guessable-looking shape where none is
 * needed.
 */
function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((byte: number): string => byte.toString(16).padStart(2, '0')).join('');
}

class UserDAO extends BaseDAO {
  /**
   * Opaque anchor for an account whose login address is already held as
   * another account's anchor.
   *
   * It must be globally unique and must never be a real address: the anchor
   * column is the primary key that every legacy `*_email` foreign key resolves
   * against, so an address used here could never be re-registered by a
   * different person after the original account changed addresses.
   */
  public static newAnchor(): string {
    return `anchor-${randomHex(16)}@users.invalid`;
  }

  public static newId(): string {
    return `usr_${randomHex(16)}`;
  }

  /**
   * Create an account, stamping the identity columns migration 0011 added.
   *
   * The anchor is a parameter rather than derived from the login address, so
   * the caller can retry with an opaque anchor when the address turned out to
   * be taken. `ON CONFLICT(email) DO NOTHING` makes that retry safe: a lost
   * race is a silent no-op rather than a second account for the same address.
   *
   * The caller claims the sign-in address in `user_emails` separately and then
   * re-resolves, because the account is not login-capable until it does.
   */
  public async createUser(input: { id: string; anchor: string; loginEmail: string; now: number }): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            'INSERT INTO users (email, created_at, updated_at, id, current_email) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING',
          )
          .bind(input.anchor, input.now, input.now, input.id, input.loginEmail)
          .run(),
      'create user',
    );
  }

  /**
   * Anchor lookup — for legacy `*_email` values and cascade resolution.
   *
   * `users.email` keeps SQLite's BINARY collation (it is the primary key), so
   * this compares exactly. Callers that want the login address go through
   * `getByCurrentEmail` or the address registry instead.
   */
  public async getByEmail(email: string): Promise<UserInternal | null> {
    const row: UserInternal | null = await this.database
      .prepare('SELECT id, email, current_email, preferred_language, created_at, updated_at FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<UserInternal>();
    return row;
  }

  public async getById(id: string): Promise<UserInternal | null> {
    const row: UserInternal | null = await this.database
      .prepare('SELECT id, email, current_email, preferred_language, created_at, updated_at FROM users WHERE id = ? LIMIT 1')
      .bind(id)
      .first<UserInternal>();
    return row;
  }

  /**
   * Login-address lookup. Case-insensitive, because the registry and
   * `current_email` are both stored lowercased while Cloudflare Access may
   * deliver a mixed-case address.
   */
  public async getByCurrentEmail(email: string): Promise<UserInternal | null> {
    const row: UserInternal | null = await this.database
      .prepare(
        'SELECT id, email, current_email, preferred_language, created_at, updated_at FROM users WHERE lower(current_email) = lower(?) LIMIT 1',
      )
      .bind(email)
      .first<UserInternal>();
    return row;
  }

  /**
   * Move the login address. The anchor is deliberately untouched: it is what
   * every legacy `*_email` column and the `connected_applications` foreign key
   * resolve against.
   */
  public async setCurrentEmail(id: string, email: string, now: number): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database.prepare('UPDATE users SET current_email = ?, updated_at = ? WHERE id = ?').bind(email, now, id).run(),
      'set current email',
    );
  }

  /**
   * Keyed on the account id, so a stored language preference survives an
   * address change. A pre-0011 database has no `id`, so the anchor is the
   * fallback — chosen by the caller, not guessed here.
   */
  public async updatePreferredLanguage(account: AccountIdentity, preferredLanguage: string | null): Promise<User | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const byId: boolean = account.id !== '';
    const key: string = byId ? account.id : account.anchorEmail;
    // Two literal statements rather than an interpolated column name: this layer
    // only ever varies SQL by an allow-listed identifier, and neither query
    // needs to vary at all.
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(byId ? UPDATE_BY_ID : UPDATE_BY_ANCHOR)
          .bind(preferredLanguage, now, key)
          .run(),
      'update user language',
    );
    const row: UserInternal | null = byId ? await this.getById(account.id) : await this.getByEmail(account.anchorEmail);
    return row ? UserDAO.toUser(row) : undefined;
  }

  /**
   * Row → domain mapping.
   *
   * `email` prefers `current_email` and falls back to the anchor, so a database
   * that has not run 0011 still maps to a usable address rather than a NULL.
   */
  public static toUser(row: UserInternal): User {
    return {
      id: row.id ?? '',
      email: normalizeEmail(row.current_email ?? row.email),
      anchorEmail: row.email,
      preferredLanguage: row.preferred_language ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { UserDAO };
