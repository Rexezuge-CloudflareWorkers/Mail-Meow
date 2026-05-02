import { describe, expect, it } from 'vitest';
import { ApiKeyUtil } from '@/utils';

describe('ApiKeyUtil', () => {
  it('generates keyed Mail-Meow API keys with metadata', async () => {
    const apiKey: string = ApiKeyUtil.generateApiKey();

    expect(apiKey.startsWith('mm_')).toBe(true);
    expect(apiKey.length).toBeGreaterThan(30);
    expect(ApiKeyUtil.getPrefix(apiKey)).toBe(apiKey.slice(0, 10));
    expect(ApiKeyUtil.getLastFour(apiKey)).toBe(apiKey.slice(-4));
    await expect(ApiKeyUtil.hashApiKey(apiKey)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different keys', async () => {
    const firstHash: string = await ApiKeyUtil.hashApiKey('mm_first');
    const secondHash: string = await ApiKeyUtil.hashApiKey('mm_second');

    expect(firstHash).not.toBe(secondHash);
  });
});
