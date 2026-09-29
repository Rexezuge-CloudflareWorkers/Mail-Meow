import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EmailValidationUtil } from '@mail-meow/backend-services/auth';
import type { EmailValidationEnv } from '@mail-meow/backend-services/auth';
import { UnauthorizedError } from '@mail-meow/backend-errors';

/**
 * Access JWT authentication.
 *
 * The behaviour that matters is diagnostic. A rejected request is either an
 * unconfigured deployment, a malformed/absent token, a token that failed
 * cryptographic verification, or a token that verified fine but carried no
 * usable address. Those are four different problems, and the previous
 * implementation reported the last two with the same message — it threw
 * "No email found in JWT token" from inside its own `try`, so the `catch`
 * caught it and rewrapped it as "JWT verification failed", claiming a
 * signature problem for a token that had verified perfectly.
 */

const { jwtVerify, createRemoteJWKSet } = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(),
}));

vi.mock('jose', () => ({ jwtVerify, createRemoteJWKSet }));

const ENV: EmailValidationEnv = { TEAM_DOMAIN: 'https://team.cloudflareaccess.com', POLICY_AUD: 'aud-1' };

function request(token?: string): Request {
  return new Request('https://app.example.com/user/me', {
    headers: token === undefined ? {} : { 'cf-access-jwt-assertion': token },
  });
}

/** A token that verifies and carries the given `email` claim. */
function verified(claim: unknown): void {
  jwtVerify.mockResolvedValue({ payload: { email: claim } });
}

beforeEach(() => {
  vi.resetAllMocks();
  createRemoteJWKSet.mockReturnValue({ jwks: true });
  verified('user@example.com');
});

describe('getAuthenticatedUserEmail — successful paths', () => {
  it('returns the email claim from a verified token', async () => {
    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), ENV)).resolves.toBe('user@example.com');
  });

  it('verifies against the Access certs endpoint for the team domain', async () => {
    await EmailValidationUtil.getAuthenticatedUserEmail(request('token'), ENV);

    // The issuer is the same value, so a misconfigured TEAM_DOMAIN that is not
    // the Access domain is rejected at verification rather than accepted here.
    expect(createRemoteJWKSet).toHaveBeenCalledWith(new URL('https://team.cloudflareaccess.com/cdn-cgi/access/certs'));
    expect(jwtVerify).toHaveBeenCalledWith('token', { jwks: true }, { issuer: 'https://team.cloudflareaccess.com', audience: 'aud-1' });
  });

  it('tolerates a trailing slash on TEAM_DOMAIN', async () => {
    await EmailValidationUtil.getAuthenticatedUserEmail(request('token'), { ...ENV, TEAM_DOMAIN: 'https://team.example.com///' });

    expect(jwtVerify).toHaveBeenCalledWith('token', { jwks: true }, { issuer: 'https://team.example.com', audience: 'aud-1' });
  });

  it('bypasses Access entirely when DEV_AUTH_EMAIL is set', async () => {
    // Local-only, no default. When present it must not touch the verifier at
    // all — otherwise a stale token would fail a dev request.
    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request(), { DEV_AUTH_EMAIL: 'dev@example.com' })).resolves.toBe(
      'dev@example.com',
    );
    expect(jwtVerify).not.toHaveBeenCalled();
  });
});

describe('getAuthenticatedUserEmail — rejected paths', () => {
  it('reports a missing token without claiming verification failed', async () => {
    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request(), ENV)).rejects.toThrow(/No Cloudflare Access JWT token/);
  });

  it('reports an empty token', async () => {
    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request(''), ENV)).rejects.toThrow(/No Cloudflare Access JWT token/);
  });

  it('reports a token that genuinely failed verification', async () => {
    jwtVerify.mockRejectedValue(new Error('signature verification failed'));

    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), ENV)).rejects.toThrow(
      /JWT verification failed: signature verification failed/,
    );
  });

  it('rejects a token whose audience is wrong', async () => {
    jwtVerify.mockRejectedValue(new Error('unexpected audience'));

    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), ENV)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('reports a missing email claim as a claim problem, not a verification failure', async () => {
    // The regression this file exists for. Verification succeeded, so saying
    // "JWT verification failed" sends an operator looking at signing keys and
    // JWKS caching when the real problem is the Access policy's claim mapping.
    verified(undefined);

    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), ENV)).rejects.toThrow(/No email found in JWT token/);
  });

  it('does not label a missing email claim as a verification failure', async () => {
    verified(undefined);

    const error: unknown = await EmailValidationUtil.getAuthenticatedUserEmail(request('token'), ENV).catch((e: unknown) => e);

    expect((error as Error).message).not.toMatch(/verification failed/i);
  });

  it('rejects an empty email claim', async () => {
    verified('');

    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), ENV)).rejects.toThrow(/No email found in JWT token/);
  });

  it.each([
    ['null', null],
    ['a number', 42],
    ['an object', { value: 'attacker@example.com' }],
    ['an array', ['user@example.com']],
    ['a boolean', true],
  ])('rejects an email claim that is %s', async (_label, claim) => {
    // The claim is attacker-reachable, and the old `payload.email as string`
    // cast would have accepted every one of these — including the object,
    // which then flowed onward as a login address.
    verified(claim);

    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), ENV)).rejects.toThrow(/No email found in JWT token/);
  });
});

describe('getAuthenticatedUserEmail — configuration', () => {
  it.each([
    ['TEAM_DOMAIN', { POLICY_AUD: 'aud-1' }],
    ['POLICY_AUD', { TEAM_DOMAIN: 'https://team.cloudflareaccess.com' }],
  ])('rejects a deployment missing %s', async (_name, env) => {
    // No defaults: a misconfigured deployment must fail loudly rather than
    // silently skipping verification.
    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), env as EmailValidationEnv)).rejects.toThrow(
      /Missing required JWT verification configuration/,
    );
  });

  it('rejects a blank POLICY_AUD', async () => {
    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), { ...ENV, POLICY_AUD: '   ' })).rejects.toThrow(
      /empty POLICY_AUD/,
    );
  });

  it('rejects multiple audiences rather than picking one', async () => {
    // Guessing which of several audiences to trust would be a silent
    // authorization decision.
    await expect(EmailValidationUtil.getAuthenticatedUserEmail(request('token'), { ...ENV, POLICY_AUD: 'aud-1,aud-2' })).rejects.toThrow(
      /Multiple JWT audiences are not supported/,
    );
  });
});
