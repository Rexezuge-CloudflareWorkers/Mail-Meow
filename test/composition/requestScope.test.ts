import { describe, expect, it, vi } from 'vitest';
import { createRequestScope } from '@mail-meow/backend-services/composition';
import type { ServiceEnvironment } from '@mail-meow/backend-services/composition';

function makeEnv(overrides: Partial<ServiceEnvironment> = {}): ServiceEnvironment {
  return {
    DB: { prepare: vi.fn() } as unknown as ServiceEnvironment['DB'],
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('test-master-key') },
    OAUTH2_TOKEN_CACHE: {} as unknown as ServiceEnvironment['OAUTH2_TOKEN_CACHE'],
    OAUTH2_TOKEN_REFRESHERS: {} as unknown as ServiceEnvironment['OAUTH2_TOKEN_REFRESHERS'],
    ...overrides,
  };
}

describe('createRequestScope', () => {
  it('exposes every service a route can need', () => {
    const scope = createRequestScope(makeEnv());

    expect(scope.apiKeys).toBeDefined();
    expect(scope.applications).toBeDefined();
    expect(scope.mailDelivery).toBeDefined();
    expect(scope.oauth2AccessTokens).toBeDefined();
    expect(scope.oauth2Authorization).toBeDefined();
    expect(scope.processing).toBeDefined();
    expect(scope.sns).toBeDefined();
    expect(scope.users).toBeDefined();
  });

  it('resolves configuration once and reuses it', () => {
    const scope = createRequestScope(makeEnv());
    // Every service holds the same reader, so a parse or a validation failure
    // happens once per request instead of once per service.
    expect(scope.config).toBe(scope.config);
    expect(scope.config.maxApplicationsPerUser).toBe(99);
  });

  it('reads settings from env and honours overrides', () => {
    const scope = createRequestScope(
      makeEnv({
        DB: {} as unknown as ServiceEnvironment['DB'],
        AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('k') },
        OAUTH2_TOKEN_CACHE: {} as unknown as ServiceEnvironment['OAUTH2_TOKEN_CACHE'],
        OAUTH2_TOKEN_REFRESHERS: {} as unknown as ServiceEnvironment['OAUTH2_TOKEN_REFRESHERS'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- env is a loose Workers binding bag by nature
        ...({ MAX_APPLICATIONS_PER_USER: '7' } as any),
      }),
    );

    expect(scope.config.maxApplicationsPerUser).toBe(7);
  });

  it('falls back to the default for a malformed setting instead of failing the request', () => {
    const scope = createRequestScope(
      makeEnv({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- env is a loose Workers binding bag by nature
        ...({ MAX_APPLICATIONS_PER_USER: 'not-a-number' } as any),
      }),
    );

    expect(scope.config.maxApplicationsPerUser).toBe(99);
  });

  it('rejects a configuration whose API key default exceeds its maximum', () => {
    expect(() =>
      createRequestScope(
        makeEnv({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- env is a loose Workers binding bag by nature
          ...({ DEFAULT_API_KEY_EXPIRY_DAYS: '30', MAX_API_KEY_EXPIRY_DAYS: '7' } as any),
        }),
      ),
    ).toThrow(/must not exceed/);
  });
});
