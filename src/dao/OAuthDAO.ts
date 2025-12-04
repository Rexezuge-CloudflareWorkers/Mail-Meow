import { OAuth, OAuthRequest, SNSRequest } from '@/model';
import { encryptData, decryptData } from '@/crypto';

export class OAuthDAO {
  constructor(
    private db: D1Database,
    private masterKey: string,
  ) {}

  async create(data: (OAuthRequest | SNSRequest) & { user_id: number }): Promise<OAuth> {
    let encryptedClientId: string, encryptedClientSecret: string, encryptedRefreshToken: string, iv: string;

    if (data.provider === 'amazon-sns') {
      const snsData = data as SNSRequest & { user_id: number };
      const { encrypted: encAccessKeyId, iv: newIv } = await encryptData(snsData.access_key_id, this.masterKey);
      const { encrypted: encSecretAccessKey } = await encryptData(snsData.secret_access_key, this.masterKey, newIv);
      const { encrypted: encTopicArn } = await encryptData(snsData.topic_arn, this.masterKey, newIv);

      encryptedClientId = encAccessKeyId;
      encryptedClientSecret = encSecretAccessKey;
      encryptedRefreshToken = encTopicArn;
      iv = newIv;
    } else {
      const oauthData = data as OAuthRequest & { user_id: number };
      const { encrypted: encClientId, iv: newIv } = await encryptData(oauthData.client_id, this.masterKey);
      const { encrypted: encClientSecret } = await encryptData(oauthData.client_secret, this.masterKey, newIv);
      const { encrypted: encRefreshToken } = await encryptData(oauthData.refresh_token, this.masterKey, newIv);

      encryptedClientId = encClientId;
      encryptedClientSecret = encClientSecret;
      encryptedRefreshToken = encRefreshToken;
      iv = newIv;
    }

    const result = await this.db
      .prepare(
        'INSERT INTO oauth (user_id, provider, encrypted_client_id, encrypted_client_secret, encrypted_refresh_token, salt) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(data.user_id, data.provider, encryptedClientId, encryptedClientSecret, encryptedRefreshToken, iv)
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

  async getDecryptedOAuth(
    userId: number,
    provider: string,
  ): Promise<{ client_id: string; client_secret: string; refresh_token: string } | null> {
    const oauth = await this.findByUserIdAndProvider(userId, provider);
    if (!oauth) return null;

    const client_id = await decryptData(oauth.encrypted_client_id, oauth.salt, this.masterKey);
    const client_secret = await decryptData(oauth.encrypted_client_secret, oauth.salt, this.masterKey);
    const refresh_token = await decryptData(oauth.encrypted_refresh_token, oauth.salt, this.masterKey);

    return { client_id, client_secret, refresh_token };
  }

  async getDecryptedSNS(userId: number): Promise<{ access_key_id: string; secret_access_key: string; topic_arn: string } | null> {
    const oauth = await this.findByUserIdAndProvider(userId, 'amazon-sns');
    if (!oauth) return null;

    const access_key_id = await decryptData(oauth.encrypted_client_id, oauth.salt, this.masterKey);
    const secret_access_key = await decryptData(oauth.encrypted_client_secret, oauth.salt, this.masterKey);
    const topic_arn = await decryptData(oauth.encrypted_refresh_token, oauth.salt, this.masterKey);

    return { access_key_id, secret_access_key, topic_arn };
  }

  async update(id: number, data: Partial<OAuthRequest>): Promise<boolean> {
    const { encrypted: encryptedClientId, iv } = await encryptData(data.client_id!, this.masterKey);
    const { encrypted: encryptedClientSecret } = await encryptData(data.client_secret!, this.masterKey, iv);
    const { encrypted: encryptedRefreshToken } = await encryptData(data.refresh_token!, this.masterKey, iv);

    const result = await this.db
      .prepare('UPDATE oauth SET encrypted_client_id = ?, encrypted_client_secret = ?, encrypted_refresh_token = ?, salt = ? WHERE id = ?')
      .bind(encryptedClientId, encryptedClientSecret, encryptedRefreshToken, iv, id)
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

  async updateRefreshToken(id: number, newRefreshToken: string): Promise<boolean> {
    const oauth = await this.findById(id);
    if (!oauth) return false;

    const { encrypted: encryptedRefreshToken } = await encryptData(newRefreshToken, this.masterKey, oauth.salt);
    const result = await this.db.prepare('UPDATE oauth SET encrypted_refresh_token = ? WHERE id = ?').bind(encryptedRefreshToken, id).run();
    return result.success && (result.meta.changes || 0) > 0;
  }
}
