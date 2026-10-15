import { describe, expect, it, vi } from 'vitest';
import { createRequestScope, Tokens } from '@mail-meow/backend-services/composition';
import type { RequestScopeEnv } from '@mail-meow/backend-services/composition';

function makeEnv(overrides: Partial<RequestScopeEnv> = {}): RequestScopeEnv {
  return {
    DB: { prepare: vi.fn() } as unknown as RequestScopeEnv['DB'],
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('test-master-key') },
    OAUTH2_TOKEN_CACHE: {} as unknown as RequestScopeEnv['OAUTH2_TOKEN_CACHE'],
    OAUTH2_TOKEN_REFRESHERS: {} as unknown as RequestScopeEnv['OAUTH2_TOKEN_REFRESHERS'],
    ...overrides,
  };
}

/** An arbitrary setting, which is not part of the declared binding surface. */
function withSetting(env: RequestScopeEnv, key: string, value: string): RequestScopeEnv {
  return Object.assign(env, { [key]: value });
}

describe('createRequestScope', () => {
  /**
   * Every service a route can resolve.
   *
   * A token that is not bound throws `DI container has no binding for token`, so
   * this is not a smoke test — it is the check that the composition root and the
   * token registry have not drifted apart. A service added to one and not the
   * other fails here rather than at 3am on whichever route reached it first.
   */
  it('binds every service a route can resolve', () => {
    const scope = createRequestScope(makeEnv());

    expect(scope.get(Tokens.ApiKeyService)).toBeDefined();
    expect(scope.get(Tokens.ApplicationService)).toBeDefined();
    expect(scope.get(Tokens.UserIdentityService)).toBeDefined();
    expect(scope.get(Tokens.MailDeliveryService)).toBeDefined();
    expect(scope.get(Tokens.OAuth2AccessTokenService)).toBeDefined();
    expect(scope.get(Tokens.OAuth2AuthorizationService)).toBeDefined();
    expect(scope.get(Tokens.ProcessingService)).toBeDefined();
    expect(scope.get(Tokens.SnsDeliveryService)).toBeDefined();
    expect(scope.get(Tokens.UserService)).toBeDefined();
  });

  it('returns the same instance for a token, so a service memo is shared', () => {
    const scope = createRequestScope(makeEnv());

    // Not just "defined": the same object. `UserIdentityService` memoizes address
    // lookups, and a per-consumer instance would defeat exactly that memo.
    expect(scope.get(Tokens.UserIdentityService)).toBe(scope.get(Tokens.UserIdentityService));
    expect(scope.get(Tokens.Config)).toBe(scope.get(Tokens.Config));
    expect(scope.get(Tokens.Config).maxApplicationsPerUser).toBe(99);
  });

  it('reads settings from env and honours overrides', () => {
    const scope = createRequestScope(withSetting(makeEnv(), 'MAX_APPLICATIONS_PER_USER', '7'));

    expect(scope.get(Tokens.Config).maxApplicationsPerUser).toBe(7);
  });

  it('falls back to the default for a malformed setting instead of failing the request', () => {
    const scope = createRequestScope(withSetting(makeEnv(), 'MAX_APPLICATIONS_PER_USER', 'not-a-number'));

    expect(scope.get(Tokens.Config).maxApplicationsPerUser).toBe(99);
  });

  it('reports a malformed setting as a startup warning rather than throwing', () => {
    // A config typo used to throw from `fromEnv`, which took down *every* request
    // in the deployment — a 500 storm instead of a log line. The warning is the
    // whole point of the change, so it is asserted rather than assumed.
    const scope = createRequestScope(withSetting(makeEnv(), 'MAX_APPLICATIONS_PER_USER', 'not-a-number'));

    expect(scope.get(Tokens.Config).validate()).toContainEqual(
      expect.stringContaining('MAX_APPLICATIONS_PER_USER="not-a-number" is not a positive integer'),
    );
  });

  /**
   * The cross-setting invariants no longer throw.
   *
   * `DEFAULT_API_KEY_EXPIRY_DAYS=30` with `MAX_API_KEY_EXPIRY_DAYS=7` is broken,
   * and the deployment still starts — but the operator is told, which is the only
   * thing that makes the failure diagnosable.
   */
  it('warns rather than throwing when the API key default exceeds its maximum', () => {
    const scope = createRequestScope(
      withSetting(
        makeEnv({
          DB: {} as unknown as RequestScopeEnv['DB'],
          AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('k') },
        }),
        'DEFAULT_API_KEY_EXPIRY_DAYS',
        '30',
      ),
    );
    withSetting(scope.get(Tokens.Env), 'MAX_API_KEY_EXPIRY_DAYS', '7');

    expect(scope.get(Tokens.Config).validate()).toContainEqual(expect.stringContaining('exceeds MAX_API_KEY_EXPIRY_DAYS'));
  });

  it('warns when a dev bypass is left set in production', () => {
    // The kit's family-wide check, inherited: `DEV_AUTH_EMAIL` means a fixed
    // identity can authenticate, which in production is every request.
    const scope = createRequestScope(withSetting(withSetting(makeEnv(), 'ENVIRONMENT', 'production'), 'DEV_AUTH_EMAIL', 'a@example.com'));

    expect(scope.get(Tokens.Config).validate()).toContainEqual(expect.stringContaining('DEV_AUTH_EMAIL is set in production'));
  });

  it('warns about an unrecognised setting name', () => {
    // A misspelled setting is otherwise indistinguishable from an unset one, and
    // silently takes the default.
    const scope = createRequestScope(withSetting(makeEnv(), 'MAX_APPLICATIONS_PER_USE', '7'));

    expect(scope.get(Tokens.Config).validate()).toContainEqual(
      expect.stringContaining('Unrecognized environment variable MAX_APPLICATIONS_PER_USE'),
    );
  });

  it('does not warn about a binding', () => {
    // `env` is a bag of bindings and settings alike. Warning about `DB` would
    // put four lines in the log on every cold start.
    const scope = createRequestScope(makeEnv());

    expect(
      scope
        .get(Tokens.Config)
        .validate()
        .filter((warning) => warning.includes('Unrecognized')),
    ).toEqual([]);
  });
});
