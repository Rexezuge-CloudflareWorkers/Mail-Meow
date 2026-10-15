import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_OAUTH2,
} from '@mail-meow/shared/constants';
import type { ConnectedApplicationStatus } from '@mail-meow/shared/constants';
import { decryptSecret, encryptSecret } from '@rexezuge/d1';
import { DatabaseError } from '@rexezuge/errors';
import type {
  AccountIdentity,
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
} from '@mail-meow/shared/model';
import { TimestampUtil, UUIDUtil } from '@rexezuge/shared';
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
 *
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
    const envelope = await encryptSecret(JSON.stringify(credentials), this.masterKey);
    // `user_email` stores the frozen anchor, not the login address: it is the
    // foreign key target, and the anchor never moves.
    await this.run(
      `
        INSERT INTO connected_applications
          (application_id, user_email, user_id, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        applicationId,
        user.anchorEmail,
        user.id || null,
        displayName,
        providerId,
        connectionMethod,
        envelope.ciphertext,
        envelope.iv,
        status,
        now,
        now,
      ],
    );
    const application: ConnectedApplicationMetadata | undefined = await this.getMetadataByIdForUser(applicationId, user);
    if (!application) {
      throw new DatabaseError('Failed to load connected application after create.');
    }
    return application;
  }

  public async listMetadataByUser(user: AccountIdentity): Promise<ConnectedApplicationMetadata[]> {
    const owner: { sql: string; bindings: string[] } = ownerClause('ca', user.id, user.anchorEmail);
    const rows = await this.all<ConnectedApplicationInternal>(
      `
        SELECT ${APPLICATION_COLUMNS}
        ${FROM_APPLICATION}
        WHERE ${owner.sql}
        ORDER BY ca.updated_at DESC, ca.created_at DESC
      `,
      owner.bindings,
    );
    return rows.map((row: ConnectedApplicationInternal): ConnectedApplicationMetadata => this.toMetadata(row));
  }

  public async countByUser(user: AccountIdentity): Promise<number> {
    const owner: { sql: string; bindings: string[] } = ownerClause('ca', user.id, user.anchorEmail);
    return this.count(`SELECT COUNT(*) AS count FROM connected_applications ca WHERE ${owner.sql}`, owner.bindings);
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
    const envelope = await encryptSecret(JSON.stringify(credentials), this.masterKey);
    const owner: { sql: string; bindings: string[] } = ownerClause('', user.id, user.anchorEmail);
    await this.run(
      `
        UPDATE connected_applications
        SET display_name = ?, encrypted_credentials = ?, credentials_iv = ?, status = ?, updated_at = ?
        WHERE application_id = ? AND ${owner.sql}
      `,
      [displayName, envelope.ciphertext, envelope.iv, status, now, applicationId, ...owner.bindings],
    );
    return this.getMetadataByIdForUser(applicationId, user);
  }

  /**
   * Record the refresh token an authorization returned, and mark the
   * application connected.
   *
   * `status` moves to `connected` here rather than on a separate call, because
   * a connected application with no refresh token is the one state worth
   * avoiding: it will never refresh again, and nothing would report it.
   *
   * `_providerEmail` is accepted and ignored. The provider's own address claim
   * is not the account's address and must never overwrite `current_email`;
   * recording it would put a second identity on the row.
   */
  public async markOAuth2Connected(applicationId: string, refreshToken: string, _providerEmail?: string): Promise<void> {
    const application: ConnectedApplication | undefined = await this.getById(applicationId);
    if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) {
      throw new DatabaseError('OAuth2 application was not found.');
    }

    const credentials: OAuth2Credentials = {
      ...(application.credentials as OAuth2Credentials),
      refreshToken,
    };
    const envelope = await encryptSecret(JSON.stringify(credentials), this.masterKey);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      `
        UPDATE connected_applications
        SET encrypted_credentials = ?, credentials_iv = ?, status = ?, updated_at = ?
        WHERE application_id = ?
      `,
      [envelope.ciphertext, envelope.iv, CONNECTED_APPLICATION_STATUS_CONNECTED, now, applicationId],
    );
  }

  /**
   * Swap in a rotated refresh token.
   *
   * Silently does nothing for a non-OAuth2 application. That is deliberate: this
   * runs on the refresh path, where an application whose method is not OAuth2
   * has nothing to rotate and raising would fail a tick over an application that
   * was never in scope.
   */
  public async updateOAuth2RefreshToken(applicationId: string, refreshToken: string): Promise<void> {
    const application: ConnectedApplication | undefined = await this.getById(applicationId);
    if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) return;
    const credentials: OAuth2Credentials = {
      ...(application.credentials as OAuth2Credentials),
      refreshToken,
    };
    const envelope = await encryptSecret(JSON.stringify(credentials), this.masterKey);
    await this.run('UPDATE connected_applications SET encrypted_credentials = ?, credentials_iv = ? WHERE application_id = ?', [
      envelope.ciphertext,
      envelope.iv,
      applicationId,
    ]);
  }

  /**
   * Delete an application, scoped to its owner.
   *
   * `ON DELETE CASCADE` takes the application's API keys and OAuth2 rows with
   * it, so there is nothing to clean up here — and doing it manually would be a
   * second, diverging copy of a rule D1 already enforces.
   */
  public async deleteForUser(applicationId: string, user: AccountIdentity): Promise<void> {
    const owner: { sql: string; bindings: string[] } = ownerClause('', user.id, user.anchorEmail);
    await this.run(`DELETE FROM connected_applications WHERE application_id = ? AND ${owner.sql}`, [applicationId, ...owner.bindings]);
  }

  private async getRowById(applicationId: string, user?: AccountIdentity): Promise<ConnectedApplicationInternal | undefined> {
    // Built together with its binding so the two can never drift apart.
    const owner: { sql: string; bindings: string[] } = user ? ownerClause('ca', user.id, user.anchorEmail) : { sql: '', bindings: [] };
    const whereUser: string = owner.sql ? ` AND ${owner.sql}` : '';
    const row = await this.first<ConnectedApplicationInternal>(
      `
        SELECT ${APPLICATION_COLUMNS}
        ${FROM_APPLICATION}
        WHERE ca.application_id = ?${whereUser}
        LIMIT 1
      `,
      [applicationId, ...owner.bindings],
    );
    return row ?? undefined;
  }

  /**
   * Decrypt a row's credential blob.
   *
   * The `encrypted_credentials` / `credentials_iv` pair is the storage form of
   * `encryptSecret`'s envelope — same AES-GCM, same 96-bit random IV, same
   * base64 — so a value written before this repo adopted the kit decrypts
   * unchanged. The names differ (`encrypted` → `ciphertext`) and that is the
   * only difference: the column is unchanged, so no migration runs and no
   * stored credential is orphaned.
   */
  private async toApplication(row: ConnectedApplicationInternal): Promise<ConnectedApplication> {
    const decryptedCredentials: string = await decryptSecret(
      { ciphertext: row.encrypted_credentials, iv: row.credentials_iv },
      this.masterKey,
    );
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
