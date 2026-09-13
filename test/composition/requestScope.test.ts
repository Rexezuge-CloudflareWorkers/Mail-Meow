import { describe, expect, it } from 'vitest';
import { createRequestScope, Tokens } from '@mail-meow/backend-services/composition';

function makeEnv() {
  return {
    DB: { prepare: () => ({ bind: () => ({ run: async () => ({ success: true }), first: async () => null, all: async () => ({ results: [] }) }) }) } as unknown as D1Database,
    AES_ENCRYPTION_KEY_SECRET: { get: async () => 'test-master-key-32-bytes-long!!' },
  };
}

describe('createRequestScope', () => {
  it('resolves core services without constructing DAOs directly', () => {
    const scope = createRequestScope(makeEnv() as never);
    expect(scope.get(Tokens.ApplicationService)).toBeDefined();
    expect(scope.get(Tokens.UserService)).toBeDefined();
    expect(scope.get(Tokens.ApiKeyService)).toBeDefined();
    expect(scope.get(Tokens.MailDeliveryService)).toBeDefined();
    expect(scope.get(Tokens.SnsDeliveryService)).toBeDefined();
    expect(scope.get(Tokens.OAuth2AuthorizationService)).toBeDefined();
    expect(scope.get(Tokens.ProcessingService)).toBeDefined();
    expect(scope.get(Tokens.AppConfig)).toBeDefined();
  });

  it('memoizes singleton services', () => {
    const scope = createRequestScope(makeEnv() as never);
    expect(scope.get(Tokens.ApplicationService)).toBe(scope.get(Tokens.ApplicationService));
  });

  it('throws for missing AES key on encrypted DAO resolution', async () => {
    const scope = createRequestScope({ DB: makeEnv().DB } as never);
    const keys = scope.get(Tokens.Keys);
    await expect(keys()).rejects.toThrow();
  });
});
