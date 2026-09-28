import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_OAUTH2,
} from '@mail-meow/shared/constants';
import type { ConnectedApplicationStatus } from '@mail-meow/shared/constants';
import { decryptData, encryptData } from '@mail-meow/backend-data/crypto';
import { DatabaseError } from '@mail-meow/backend-errors';
import type {
  AccountIdentity,
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
} from '@mail-meow/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-meow/shared/utils';
import { EncryptedDAO } from './BaseDAO';

/**
 * `user_email` is selected twice on purpose.
 *
 * The first is the frozen anchor, the second the account's current sign-in
 * address via a LEFT JOIN on `users.id`. Resolving here rather than in the
 * caller is what keeps an opaque `anchor-<hex>@users.invalid` out of an API
 * response and out of the provider mailbox recorded on a task run.
 * `COALESCE` falls back to the anchor for a pre-0011 row with no `user_id`.
 */
const APPLICATION_COLUMNS = `
  ca.application_id, ca.user_email, ca.user_id,
  COALESCE(u.current_email, ca.user_email) AS user_email_current,
  ca.display_name, ca.provider_id, ca.connection_method,
  ca.encrypted_credentials, ca.credentials_iv, ca.status,
  ca.created_at, ca.updated_at`;

const FROM_APPLICATION = 'FROM connected_applications ca LEFT JOIN users u ON u.id = ca.user_id';

/**
 * Ownership predicate.
 *
 * Matches on `user_id` when the account has one — that is what makes access
 * survive an address change, since the id does not move. The address clause is
 * the fallback for rows written before migration 0011 (or whose backfill could
 * not resolve them), and must not be dropped: those rows are the caller's own
 * applications and would otherwise silently disappear from their listing.
 */
/**
 * `prefix` is the table alias (or empty for a bare `UPDATE`), because SQLite
 * only accepts a qualified column name against an alias that the statement
 * itself introduces.
 */
function ownerClause(prefix: string, userId: string, userEmail: string): { sql: string; bindings: string[] } {
  const dot: string = prefix ? `${prefix}.` : '';
  return userId
    ? { sql: `(${dot}user_id = ? OR (${dot}user_id IS NULL AND ${dot}user_email = ?))`, bindings: [userId, userEmail] }
    : { sql: `${dot}user_email = ?`, bindings: [userEmail] };
}

class ConnectedApplicationDAO extends EncryptedDAO {
  public async create(
    user: AccountIdentity,
    displayName: string,
    providerId: string,
    connectionMethod: string,
    credentials: ConnectedApplicationCredentials,
    status: string,
  ): Promise<ConnectedApplicationMetadata> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const applicationId: string = UUIDUtil.getRandomUUID();
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    // `user_email` stores the frozen anchor, not the login address: it is the
    // foreign key target, and the anchor never moves.
    await this.runWithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO connected_applications
                (application_id, user_email, user_id, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .bind(
            applicationId,
            user.anchorEmail,
            user.id || null,
            displayName,
            providerId,
            connectionMethod,
            encrypted.encrypted,
            encrypted.iv,
            status,
            now,
            now,
          )
          .run(),
      'create connected application',
    );
    const application: ConnectedApplicationMetadata | undefined = await this.getMetadataByIdForUser(applicationId, user);
    if (!application) {
      throw new DatabaseError('Failed to load connected application after create.');
    }
    return application;
  }

  public async listMetadataByUser(user: AccountIdentity): Promise<ConnectedApplicationMetadata[]> {
    const owner: { sql: string; bindings: string[] } = ownerClause('ca', user.id, user.anchorEmail);
    const rows: ConnectedApplicationInternal[] = await this.database
      .prepare(
        `
          SELECT ${APPLICATION_COLUMNS}
          ${FROM_APPLICATION}
          WHERE ${owner.sql}
          ORDER BY ca.updated_at DESC, ca.created_at DESC
        `,
      )
      .bind(...owner.bindings)
      .all<ConnectedApplicationInternal>()
      .then((result: D1Result<ConnectedApplicationInternal>): ConnectedApplicationInternal[] => result.results || []);
    return rows.map((row: ConnectedApplicationInternal): ConnectedApplicationMetadata => this.toMetadata(row));
  }

  public async countByUser(user: AccountIdentity): Promise<number> {
    const owner: { sql: string; bindings: string[] } = ownerClause('ca', user.id, user.anchorEmail);
    const row: { count: number } | null = await this.database
      .prepare(`SELECT COUNT(*) AS count FROM connected_applications ca WHERE ${owner.sql}`)
      .bind(...owner.bindings)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  public async getMetadataByIdForUser(applicationId: string, user: AccountIdentity): Promise<ConnectedApplicationMetadata | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId, user);
    return row ? this.toMetadata(row) : undefined;
  }

  public async getById(applicationId: string): Promise<ConnectedApplication | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId);
    return row ? this.toApplication(row) : undefined;
  }

  public async getByIdForUser(applicationId: string, user: AccountIdentity): Promise<ConnectedApplication | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId, user);
    return row ? this.toApplication(row) : undefined;
  }

  public async updateForUser(
    applicationId: string,
    user: AccountIdentity,
    displayName: string,
    credentials: ConnectedApplicationCredentials,
    status: string,
  ): Promise<ConnectedApplicationMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    const owner: { sql: string; bindings: string[] } = ownerClause('', user.id, user.anchorEmail);
    await this.runWithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE connected_applications
              SET display_name = ?, encrypted_credentials = ?, credentials_iv = ?, status = ?, updated_at = ?
              WHERE application_id = ? AND ${owner.sql}
            `,
          )
          .bind(displayName, encrypted.encrypted, encrypted.iv, status, now, applicationId, ...owner.bindings)
          .run(),
      'update connected application',
    );
    return this.getMetadataByIdForUser(applicationId, user);
  }

  public async markOAuth2Connected(applicationId: string, refreshToken: string, _providerEmail?: string): Promise<void> {
    const application: ConnectedApplication | undefined = await this.getById(applicationId);
    if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) {
      throw new DatabaseError('OAuth2 application was not found.');
    }

    const credentials: OAuth2Credentials = {
      ...(application.credentials as OAuth2Credentials),
      refreshToken,
    };
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.runWithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE connected_applications
              SET encrypted_credentials = ?, credentials_iv = ?, status = ?, updated_at = ?
              WHERE application_id = ?
            `,
          )
          .bind(encrypted.encrypted, encrypted.iv, CONNECTED_APPLICATION_STATUS_CONNECTED, now, applicationId)
          .run(),
      'mark OAuth2 application connected',
    );
  }

  public async updateOAuth2RefreshToken(applicationId: string, refreshToken: string): Promise<void> {
    const application: ConnectedApplication | undefined = await this.getById(applicationId);
    if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) return;
    const credentials: OAuth2Credentials = {
      ...(application.credentials as OAuth2Credentials),
      refreshToken,
    };
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    await this.runWithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('UPDATE connected_applications SET encrypted_credentials = ?, credentials_iv = ? WHERE application_id = ?')
          .bind(encrypted.encrypted, encrypted.iv, applicationId)
          .run(),
      'update OAuth2 refresh token',
    );
  }

  public async deleteForUser(applicationId: string, user: AccountIdentity): Promise<void> {
    const owner: { sql: string; bindings: string[] } = ownerClause('', user.id, user.anchorEmail);
    await this.runWithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(`DELETE FROM connected_applications WHERE application_id = ? AND ${owner.sql}`)
          .bind(applicationId, ...owner.bindings)
          .run(),
      'delete connected application',
    );
  }

  private async getRowById(applicationId: string, user?: AccountIdentity): Promise<ConnectedApplicationInternal | undefined> {
    // Built together with its binding so the two can never drift apart.
    const owner: { sql: string; bindings: string[] } = user ? ownerClause('ca', user.id, user.anchorEmail) : { sql: '', bindings: [] };
    const whereUser: string = owner.sql ? ` AND ${owner.sql}` : '';
    const row: ConnectedApplicationInternal | null = await this.database
      .prepare(
        `
          SELECT ${APPLICATION_COLUMNS}
          ${FROM_APPLICATION}
          WHERE ca.application_id = ?${whereUser}
          LIMIT 1
        `,
      )
      .bind(applicationId, ...owner.bindings)
      .first<ConnectedApplicationInternal>();
    return row ?? undefined;
  }

  private async toApplication(row: ConnectedApplicationInternal): Promise<ConnectedApplication> {
    const decryptedCredentials: string = await decryptData(row.encrypted_credentials, row.credentials_iv, this.masterKey);
    return {
      ...this.toMetadata(row),
      credentials: JSON.parse(decryptedCredentials) as ConnectedApplicationCredentials,
    };
  }

  private toMetadata(row: ConnectedApplicationInternal): ConnectedApplicationMetadata {
    return {
      applicationId: row.application_id,
      // The resolved current address, not the anchor. A row with no joined
      // account (pre-0011) falls back to its stored value, which is the address.
      userEmail: row.user_email_current ?? row.user_email,
      displayName: row.display_name,
      providerId: row.provider_id,
      connectionMethod: row.connection_method,
      status: this.toStatus(row.status),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Maps the stored status, rejecting anything outside the documented set.
   *
   * This previously folded every non-`connected` value into `draft`. The column
   * has a CHECK constraint, so a value outside the set can only mean a corrupted
   * row — and silently relabelling it as `draft` hid that signal behind an
   * apparently healthy application.
   */
  private toStatus(status: string): ConnectedApplicationStatus {
    if (status === CONNECTED_APPLICATION_STATUS_CONNECTED || status === CONNECTED_APPLICATION_STATUS_DRAFT) {
      return status;
    }
    throw new DatabaseError(`Connected application has an unrecognized status: ${status}`);
  }
}

export { ConnectedApplicationDAO };
