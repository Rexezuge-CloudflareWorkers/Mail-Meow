import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_OAUTH2,
} from '@mail-meow/shared/constants';
import type { ConnectedApplicationStatus } from '@mail-meow/shared/constants';
import { decryptData, encryptData } from '@mail-meow/backend-data/crypto';
import { DatabaseError } from '@mail-meow/backend-errors';
import type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
} from '@mail-meow/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-meow/shared/utils';
import { EncryptedDAO } from './BaseDAO';

const APPLICATION_COLUMNS =
  'application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at';

class ConnectedApplicationDAO extends EncryptedDAO {
  public async create(
    userEmail: string,
    displayName: string,
    providerId: string,
    connectionMethod: string,
    credentials: ConnectedApplicationCredentials,
    status: string,
  ): Promise<ConnectedApplicationMetadata> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const applicationId: string = UUIDUtil.getRandomUUID();
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    await this.runWithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO connected_applications
                (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .bind(applicationId, userEmail, displayName, providerId, connectionMethod, encrypted.encrypted, encrypted.iv, status, now, now)
          .run(),
      'create connected application',
    );
    const application: ConnectedApplicationMetadata | undefined = await this.getMetadataByIdForUser(applicationId, userEmail);
    if (!application) {
      throw new DatabaseError('Failed to load connected application after create.');
    }
    return application;
  }

  public async listMetadataByUserEmail(userEmail: string): Promise<ConnectedApplicationMetadata[]> {
    const rows: ConnectedApplicationInternal[] = await this.database
      .prepare(
        `
          SELECT ${APPLICATION_COLUMNS}
          FROM connected_applications
          WHERE user_email = ?
          ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .bind(userEmail)
      .all<ConnectedApplicationInternal>()
      .then((result: D1Result<ConnectedApplicationInternal>): ConnectedApplicationInternal[] => result.results || []);
    return rows.map((row: ConnectedApplicationInternal): ConnectedApplicationMetadata => this.toMetadata(row));
  }

  public async countByUserEmail(userEmail: string): Promise<number> {
    const row: { count: number } | null = await this.database
      .prepare('SELECT COUNT(*) AS count FROM connected_applications WHERE user_email = ?')
      .bind(userEmail)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  public async getMetadataByIdForUser(applicationId: string, userEmail: string): Promise<ConnectedApplicationMetadata | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId, userEmail);
    return row ? this.toMetadata(row) : undefined;
  }

  public async getById(applicationId: string): Promise<ConnectedApplication | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId);
    return row ? this.toApplication(row) : undefined;
  }

  public async getByIdForUser(applicationId: string, userEmail: string): Promise<ConnectedApplication | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId, userEmail);
    return row ? this.toApplication(row) : undefined;
  }

  public async updateForUser(
    applicationId: string,
    userEmail: string,
    displayName: string,
    credentials: ConnectedApplicationCredentials,
    status: string,
  ): Promise<ConnectedApplicationMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    await this.runWithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE connected_applications
              SET display_name = ?, encrypted_credentials = ?, credentials_iv = ?, status = ?, updated_at = ?
              WHERE application_id = ? AND user_email = ?
            `,
          )
          .bind(displayName, encrypted.encrypted, encrypted.iv, status, now, applicationId, userEmail)
          .run(),
      'update connected application',
    );
    return this.getMetadataByIdForUser(applicationId, userEmail);
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

  public async deleteForUser(applicationId: string, userEmail: string): Promise<void> {
    await this.runWithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('DELETE FROM connected_applications WHERE application_id = ? AND user_email = ?')
          .bind(applicationId, userEmail)
          .run(),
      'delete connected application',
    );
  }

  private async getRowById(applicationId: string, userEmail?: string): Promise<ConnectedApplicationInternal | undefined> {
    // Built together with its binding so the two can never drift apart.
    const whereUser: string = userEmail ? ' AND user_email = ?' : '';
    const bindings: string[] = userEmail ? [applicationId, userEmail] : [applicationId];
    const row: ConnectedApplicationInternal | null = await this.database
      .prepare(
        `
          SELECT ${APPLICATION_COLUMNS}
          FROM connected_applications
          WHERE application_id = ?${whereUser}
          LIMIT 1
        `,
      )
      .bind(...bindings)
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
      userEmail: row.user_email,
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
