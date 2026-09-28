import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@mail-meow/backend-errors';
import { isRetryableHttpStatus, providerFetchJson, providerFetchOk } from '@mail-meow/provider-clients';
import { FetchHttpClient } from '@mail-meow/provider-clients/http';

const REQUEST = { providerName: 'TestProvider', operation: 'do thing' };

function clientReturning(...responses: Response[]) {
  const fetchRaw = vi.fn();
  for (const response of responses) {
    fetchRaw.mockResolvedValueOnce(response);
  }
  return { fetchRaw, client: { fetchRaw } };
}

describe('isRetryableHttpStatus', () => {
  it.each([408, 409, 425, 429, 500, 502, 503, 504])('treats %i as retryable', (status) => {
    expect(isRetryableHttpStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('treats %i as non-retryable', (status) => {
    expect(isRetryableHttpStatus(status)).toBe(false);
  });
});

describe('providerFetchRaw', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws a retryable error when a 5xx carries a non-JSON body', async () => {
    // Regression: parsing the body before checking `ok` turned an HTML error
    // page from a proxy into a bare SyntaxError, which is not a ServiceError
    // and was therefore masked as an opaque 500 with the real cause lost.
    const { client } = clientReturning(new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }));

    await expect(providerFetchOk('https://example.com', { method: 'GET' }, { ...REQUEST, client })).rejects.toBeInstanceOf(
      ProviderApiRetryableError,
    );
  });

  it('throws a non-retryable error for a 4xx', async () => {
    const { client } = clientReturning(
      new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 403, statusText: 'Forbidden' }),
    );

    await expect(providerFetchOk('https://example.com', { method: 'GET' }, { ...REQUEST, client })).rejects.toBeInstanceOf(
      ProviderApiNonRetryableError,
    );
  });

  it('surfaces the provider error message', async () => {
    const { client } = clientReturning(
      new Response(JSON.stringify({ error: { message: 'Invalid credentials' } }), { status: 401, statusText: 'Unauthorized' }),
    );

    await expect(providerFetchOk('https://example.com', { method: 'GET' }, { ...REQUEST, client })).rejects.toThrow(/Invalid credentials/);
  });

  it('truncates and collapses a very long error body', async () => {
    const { client } = clientReturning(new Response('x'.repeat(5000), { status: 500, statusText: 'Server Error' }));

    const error: unknown = await providerFetchOk('https://example.com', { method: 'GET' }, { ...REQUEST, client }).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderApiRetryableError);
    expect((error as Error).message.length).toBeLessThan(700);
  });

  it('wraps a transport failure as retryable', async () => {
    const client = { fetchRaw: vi.fn().mockRejectedValue(new TypeError('network error')) };

    await expect(providerFetchOk('https://example.com', { method: 'GET' }, { ...REQUEST, client })).rejects.toBeInstanceOf(
      ProviderApiRetryableError,
    );
  });

  it('attaches the bearer token when one is supplied', async () => {
    const { client, fetchRaw } = clientReturning(new Response(null, { status: 204 }));

    await providerFetchOk('https://example.com', { method: 'GET' }, { ...REQUEST, client, accessToken: 'secret-token' });

    const init = fetchRaw.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer secret-token');
  });
});

describe('providerFetchJson', () => {
  it('parses a JSON body', async () => {
    const { client } = clientReturning(Response.json({ id: 'abc' }));

    await expect(providerFetchJson('https://example.com', { method: 'GET' }, { ...REQUEST, client })).resolves.toEqual({ id: 'abc' });
  });

  it('returns undefined for an empty body rather than throwing', async () => {
    const { client } = clientReturning(new Response('', { status: 200 }));

    await expect(providerFetchJson('https://example.com', { method: 'GET' }, { ...REQUEST, client })).resolves.toBeUndefined();
  });

  it('rejects a malformed JSON 200 instead of leaking a SyntaxError', async () => {
    const { client } = clientReturning(new Response('{ not json', { status: 200 }));

    await expect(providerFetchJson('https://example.com', { method: 'GET' }, { ...REQUEST, client })).rejects.toBeInstanceOf(
      ProviderApiNonRetryableError,
    );
  });
});

describe('FetchHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aborts via AbortSignal when no signal is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new FetchHttpClient().fetchRaw('https://example.com', { method: 'GET' });

    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('passes an explicit timeout through to the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await new FetchHttpClient().fetchRaw('https://example.com', { method: 'GET' }, 1234);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
