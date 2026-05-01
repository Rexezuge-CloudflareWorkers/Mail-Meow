import { CryptoUtil } from './CryptoUtil';

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
