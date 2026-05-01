import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTED_APPLICATION_STATUS_DRAFT, CONNECTION_METHOD_OAUTH2 } from '@mail-meow/shared/constants';
import { decryptData, encryptData } from '@/crypto';
import { DatabaseError } from '@/error';
import type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
} from '@mail-meow/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-meow/shared/utils';

class ConnectedApplicationDAO {
  protected readonly database: D1Database;
  protected readonly masterKey: string;

  constructor(database: D1Database, masterKey: string) {
    this.database = database;
    this.masterKey = masterKey;
  }

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
    const result: D1Result = await this.database
      .prepare(
        `
          INSERT INTO connected_applications
            (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(applicationId, userEmail, displayName, providerId, connectionMethod, encrypted.encrypted, encrypted.iv, status, now, now)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to create connected application: ${result.error}`);
    }
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
          SELECT application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at
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
    const result: D1Result = await this.database
      .prepare(
        `
          UPDATE connected_applications
          SET display_name = ?, encrypted_credentials = ?, credentials_iv = ?, status = ?, updated_at = ?
          WHERE application_id = ? AND user_email = ?
        `,
      )
      .bind(displayName, encrypted.encrypted, encrypted.iv, status, now, applicationId, userEmail)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to update connected application: ${result.error}`);
    }
    return this.getMetadataByIdForUser(applicationId, userEmail);
  }

  public async markOAuth2Connected(applicationId: string, refreshToken: string): Promise<void> {
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
    const result: D1Result = await this.database
      .prepare(
        `
          UPDATE connected_applications
          SET encrypted_credentials = ?, credentials_iv = ?, status = ?, updated_at = ?
          WHERE application_id = ?
        `,
      )
      .bind(encrypted.encrypted, encrypted.iv, CONNECTED_APPLICATION_STATUS_CONNECTED, now, applicationId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to mark OAuth2 application connected: ${result.error}`);
    }
  }

  public async updateOAuth2RefreshToken(applicationId: string, refreshToken: string): Promise<void> {
    const application: ConnectedApplication | undefined = await this.getById(applicationId);
    if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) return;
    const credentials: OAuth2Credentials = {
      ...(application.credentials as OAuth2Credentials),
      refreshToken,
    };
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const result: D1Result = await this.database
      .prepare('UPDATE connected_applications SET encrypted_credentials = ?, credentials_iv = ?, updated_at = ? WHERE application_id = ?')
      .bind(encrypted.encrypted, encrypted.iv, now, applicationId)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to update OAuth2 refresh token: ${result.error}`);
    }
  }

  public async deleteForUser(applicationId: string, userEmail: string): Promise<void> {
    const result: D1Result = await this.database
      .prepare('DELETE FROM connected_applications WHERE application_id = ? AND user_email = ?')
      .bind(applicationId, userEmail)
      .run();
    if (!result.success) {
      throw new DatabaseError(`Failed to delete connected application: ${result.error}`);
    }
  }

  private async getRowById(applicationId: string, userEmail?: string): Promise<ConnectedApplicationInternal | undefined> {
    const whereUser: string = userEmail ? ' AND user_email = ?' : '';
    const bindings: string[] = userEmail ? [applicationId, userEmail] : [applicationId];
    const row: ConnectedApplicationInternal | null = await this.database
      .prepare(
        `
          SELECT application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at
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
      status:
        row.status === CONNECTED_APPLICATION_STATUS_CONNECTED ? CONNECTED_APPLICATION_STATUS_CONNECTED : CONNECTED_APPLICATION_STATUS_DRAFT,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export { ConnectedApplicationDAO };
