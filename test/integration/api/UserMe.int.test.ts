import { describe, expect, it, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { applyMigrations } from '../helpers/migrations';

describe('User me API', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('returns current user with limits and preferredLanguage', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/me');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { email: string; preferredLanguage: string | null; limits: Record<string, number> };
    expect(body.email).toBe('test@example.com');
    expect(body.limits.maxApplicationsPerUser).toBe(99);
  });

  it('updates preferredLanguage and returns normalized tag', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredLanguage: 'de' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { preferredLanguage: string };
    expect(body.preferredLanguage).toBe('de');
  });

  it('rejects unsupported language', async () => {
    const response: Response = await SELF.fetch('http://localhost/user/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredLanguage: 'xx-invalid' }),
    });
    expect(response.status).toBe(400);
  });
});
