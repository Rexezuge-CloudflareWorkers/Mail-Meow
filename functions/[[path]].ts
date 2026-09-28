interface PagesProxyEnv {
  API_WORKER: Fetcher;
}

const CF_CONNECTING_IP_HEADER = 'CF-Connecting-IP';
const FORWARDED_FOR_HEADER = 'X-Forwarded-For';
const FORWARDED_HOST_HEADER = 'X-Forwarded-Host';
const FORWARDED_PROTO_HEADER = 'X-Forwarded-Proto';
const FORWARDED_URI_HEADER = 'X-Forwarded-Uri';
const HOP_BY_HOP_HEADERS: readonly string[] = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

export const proxyToApi: PagesFunction<PagesProxyEnv> = async ({ request, env }) => {
  const originalUrl: URL = new URL(request.url);

  const headers: Headers = new Headers(request.headers);
  // Hop-by-hop headers describe a single connection and must not be relayed.
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.set(FORWARDED_HOST_HEADER, originalUrl.host);
  headers.set(FORWARDED_PROTO_HEADER, originalUrl.protocol.replace(':', ''));
  headers.set(FORWARDED_URI_HEADER, `${originalUrl.pathname}${originalUrl.search}`);

  // Always overwrite rather than conditionally set. Setting only when
  // CF-Connecting-IP is present left a caller-supplied X-Forwarded-For intact on
  // any request that reached Pages without that header, so the origin would
  // trust an attacker-chosen client IP.
  headers.delete(FORWARDED_FOR_HEADER);
  const clientIp: string | null = request.headers.get(CF_CONNECTING_IP_HEADER);
  if (clientIp) {
    headers.set(FORWARDED_FOR_HEADER, clientIp);
  }

  const proxyRequest: Request = new Request(originalUrl.href, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: request.redirect,
  });

  return env.API_WORKER.fetch(proxyRequest);
};

export const onRequest: PagesFunction<PagesProxyEnv> = proxyToApi;
