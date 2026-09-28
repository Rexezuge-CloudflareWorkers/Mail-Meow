import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@mail-meow/backend-errors';
import { FetchHttpClient, type IHttpClient } from './http/HttpClient';

const defaultHttpClient: IHttpClient = new FetchHttpClient();

interface ProviderRequest {
  /**
  Short provider label used in error messages, e.g. `Gmail`.
  */
  providerName: string;
  /**
  Short operation label used in error messages, e.g. `send message`.
  */
  operation: string;
  /**
  When set, sent as a bearer token.
  */
  accessToken?: string;
  /**
  Overrides the client default.
  */
  timeoutMs?: number;
  /**
  Injectable transport; defaults to the real one.
  */
  client?: IHttpClient;
}

/**
 * Retryable HTTP statuses: transient by definition, so the same request may
 * succeed later. Everything else (4xx client errors, redirects) will fail
 * identically on retry.
 */
function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function buildProviderApiError(request: ProviderRequest, status: number, statusText: string, detail: string): Error {
  const message: string = `${request.providerName} ${request.operation} failed (${status.toString()}): ${detail || statusText || 'unknown error'}`;
  return isRetryableHttpStatus(status) ? new ProviderApiRetryableError(message) : new ProviderApiNonRetryableError(message);
}

/**
 * Pulls a human-readable message out of a provider error body.
 *
 * Provider bodies can echo back request material (tokens, addresses), so this
 * is the single place that decides what leaves the provider boundary, and the
 * text is truncated.
 */
function extractErrorDetail(body: string, fallback: string): string {
  if (!body) {
    return fallback;
  }
  const MAX_DETAIL_LENGTH = 512;
  let detail: string = body;
  try {
    const data: unknown = JSON.parse(body);
    if (data && typeof data === 'object') {
      const error: unknown = (data as { error?: unknown }).error;
      if (typeof error === 'string' && error) {
        detail = error;
      } else if (error && typeof error === 'object') {
        const message: unknown = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message) {
          detail = message;
        }
      }
    }
  } catch {
    // Not JSON (an HTML error page, for instance) — pass the raw text through.
  }
  const collapsed: string = detail.replaceAll(/\s+/g, ' ').trim();
  return collapsed.length > MAX_DETAIL_LENGTH ? `${collapsed.slice(0, MAX_DETAIL_LENGTH)}…` : collapsed;
}

/**
 * Performs a provider request and throws a classified `ServiceError` on failure.
 *
 * Order matters: the status is checked *before* the body is parsed. Parsing
 * first would turn a non-JSON error response (an HTML page from an edge proxy,
 * an empty 503) into a bare `SyntaxError`, which is not a `ServiceError`, so
 * the route layer would mask it as an opaque 500 and the real cause would be
 * lost.
 */
async function providerFetchRaw(url: string, init: RequestInit, request: ProviderRequest): Promise<Response> {
  const headers: Headers = new Headers(init.headers);
  if (request.accessToken) {
    headers.set('Authorization', `Bearer ${request.accessToken}`);
  }
  const client: IHttpClient = request.client ?? defaultHttpClient;

  let response: Response;
  try {
    // Pass the value through undefined so FetchHttpClient's own default applies;
    // an explicit 0 would mean "abort immediately" to AbortSignal.timeout.
    response = await client.fetchRaw(url, { ...init, headers }, request.timeoutMs);
  } catch (error: unknown) {
    // Network failure, DNS error, or our own timeout abort.
    throw new ProviderApiRetryableError(
      `${request.providerName} ${request.operation} failed before a response was received: ${
        error instanceof Error ? error.name : 'unknown error'
      }`,
    );
  }

  if (!response.ok) {
    throw buildProviderApiError(
      request,
      response.status,
      response.statusText,
      extractErrorDetail(await safeText(response), response.statusText),
    );
  }
  return response;
}

/**
Reads the body as text, tolerating a stream that cannot be re-read.
*/
async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Performs a provider request that only needs to succeed, discarding the body.
 * Use for Graph's `sendMail` and Gmail's `messages.trash`.
 */
async function providerFetchOk(url: string, init: RequestInit, request: ProviderRequest): Promise<void> {
  await providerFetchRaw(url, init, request);
}

/**
 * Performs a provider request and parses a JSON body.
 *
 * Returns `undefined` for an empty body so a caller can distinguish "no
 * payload" from "payload with unexpected shape" instead of crashing inside
 * `JSON.parse`.
 */
async function providerFetchJson<T>(url: string, init: RequestInit, request: ProviderRequest): Promise<T | undefined> {
  const response: Response = await providerFetchRaw(url, init, request);
  const text: string = await safeText(response);
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderApiNonRetryableError(`${request.providerName} ${request.operation} returned a malformed JSON response.`);
  }
}

export { extractErrorDetail, isRetryableHttpStatus, providerFetchJson, providerFetchOk, providerFetchRaw };
export type { ProviderRequest };
