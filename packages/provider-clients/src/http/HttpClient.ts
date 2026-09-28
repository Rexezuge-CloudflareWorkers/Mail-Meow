/**
 * The single outbound HTTP transport for every provider client.
 *
 * Everything with a network hop goes through an `IHttpClient` so tests can
 * substitute the transport instead of intercepting globals, and so timeout
 * handling lives in exactly one place.
 */
interface IHttpClient {
  /**
  Performs the request and returns the raw `Response`, body unread.
  */
  fetchRaw(url: string, init: RequestInit, timeoutMs?: number): Promise<Response>;
}

/**
 * Long enough to absorb a slow provider, short enough to fail inside the
 * request budget a caller is willing to wait for.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

class FetchHttpClient implements IHttpClient {
  constructor(private readonly defaultTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS) {}

  public async fetchRaw(url: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
    // Workers have no subrequest kill switch: without a deadline a hung provider
    // holds the isolate until the platform limit, discarding the D1/KV work
    // already done and consuming the subrequest budget.
    const signal: AbortSignal = init.signal ?? AbortSignal.timeout(timeoutMs ?? this.defaultTimeoutMs);
    return fetch(url, { ...init, signal });
  }
}

export { DEFAULT_REQUEST_TIMEOUT_MS, FetchHttpClient };
export type { IHttpClient };
