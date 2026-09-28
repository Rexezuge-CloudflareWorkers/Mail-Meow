import { decryptData, encryptData } from '../crypto';
import { KV_MINIMUM_TIME_TO_LIVE_SECONDS, KV_NAMESPACE_OAUTH2_ACCESS_TOKEN_CACHE } from '../constants';
import { TimestampUtil } from '@mail-meow/shared/utils';
import { IKeyValueDAO } from './IKeyValueDAO';

interface OAuth2CachedAccessToken {
  applicationId: string;
  accessToken: string;
  expiresAt: number;
}

interface OAuth2CachedAccessTokenData {
  encryptedAccessToken: string;
  iv: string;
  expiresAt: number;
}

class OAuth2AccessTokenCacheDAO extends IKeyValueDAO {
  protected readonly masterKey: string;

  constructor(kv: KVNamespace, masterKey: string) {
    super(kv, KV_NAMESPACE_OAUTH2_ACCESS_TOKEN_CACHE);
    this.masterKey = masterKey;
  }

  public async getCachedAccessToken(applicationId: string, minValidSeconds: number): Promise<OAuth2CachedAccessToken | undefined> {
    const cached: OAuth2CachedAccessTokenData | null = await this.get<OAuth2CachedAccessTokenData>(applicationId);
    if (!cached) return undefined;

    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    if (cached.expiresAt <= now + minValidSeconds) {
      await this.delete(applicationId);
      return undefined;
    }

    let accessToken: string;
    try {
      accessToken = await decryptData(cached.encryptedAccessToken, cached.iv, this.masterKey);
    } catch (error: unknown) {
      // A value that will not authenticate is unusable: the key was rotated or
      // the entry was corrupted. Letting this throw made every token fetch fail
      // while the poisoned entry stayed in KV indefinitely, so evict it and let
      // the caller refresh.
      await this.delete(applicationId);
      console.warn(`Discarding undecryptable cached access token for application ${applicationId}:`, error);
      return undefined;
    }

    return { applicationId, accessToken, expiresAt: cached.expiresAt };
  }

  public async storeAccessToken(applicationId: string, accessToken: string, expiresAt: number): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    if (expiresAt <= now) return;

    const encrypted = await encryptData(accessToken, this.masterKey);
    const data: OAuth2CachedAccessTokenData = {
      encryptedAccessToken: encrypted.encrypted,
      iv: encrypted.iv,
      expiresAt,
    };
    // KV rejects a TTL below its floor, so clamp rather than reject the write.
    const expirationTtl: number = Math.max(expiresAt - now, KV_MINIMUM_TIME_TO_LIVE_SECONDS);
    await this.put(applicationId, data, { expirationTtl });
  }

  public async deleteAccessToken(applicationId: string): Promise<void> {
    await this.delete(applicationId);
  }
}

export { OAuth2AccessTokenCacheDAO };
export type { OAuth2CachedAccessToken };
