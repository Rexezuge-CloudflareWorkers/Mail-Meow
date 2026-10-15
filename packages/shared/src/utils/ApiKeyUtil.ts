import { CryptoUtil } from '@rexezuge/shared';

/**
 * The shape of a Mail-Meow API key, and the one-way function over it.
 *
 * `mm_` is a three-character prefix so a leaked key can be recognised in a log
 * or a GitHub search without being valid anywhere else, and so the lookup in
 * `ApplicationApiKeyDAO` can reject a non-key before it costs a hash. 32 random
 * bytes is 256 bits, which is why `getLastFour` can be shown in the UI: there is
 * nothing to guess.
 *
 * `hashApiKey` is a plain SHA-256, not a password hash, and that is the right
 * call here — the input is already 256 bits of entropy, so there is no
 * dictionary to slow down, and the lookup is by hash on every public request,
 * where a deliberately expensive hash would be a self-inflicted DoS.
 */
class ApiKeyUtil {
  public static generateApiKey(): string {
    return `mm_${CryptoUtil.randomBase64Url(32)}`;
  }

  public static async hashApiKey(apiKey: string): Promise<string> {
    return CryptoUtil.sha256Hex(apiKey);
  }

  public static getPrefix(apiKey: string): string {
    return apiKey.slice(0, 10);
  }

  public static getLastFour(apiKey: string): string {
    return apiKey.slice(-4);
  }
}

export { ApiKeyUtil };
