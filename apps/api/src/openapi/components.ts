/**
 * The `Exception` envelope every error response uses.
 *
 * Declared once here rather than inlined in fifteen route schemas, where the same
 * 20-line block had been copy-pasted — including one literal that appeared in
 * nine files and had already drifted between the `/user/*` and `/api/*` variants.
 */
const EXCEPTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    Exception: {
      type: 'object' as const,
      properties: {
        Type: { type: 'string' as const, description: 'Machine-readable error type.' },
        Message: { type: 'string' as const, description: 'Human-readable, already redacted.' },
      },
    },
  },
};

/**
 * Every response entry goes through this so they share one inferred shape.
 *
 * An entry that omitted `example` while others included it produced two
 * incompatible content types, and TypeScript then rejected the whole `responses`
 * map against chanfana's `ResponseConfig`.
 */
function jsonContent(example?: unknown): { 'application/json': { schema: typeof EXCEPTION_SCHEMA; example: unknown } } {
  return { 'application/json': { schema: EXCEPTION_SCHEMA, example } };
}

/**
 * Builds the standard error responses for a route.
 *
 * The return type is deliberately inferred. Chanfana narrows `schema.type` to
 * its own `SchemaObjectType` union and keys `content` by a branded media-type
 * string, so any hand-written approximation of that shape is rejected even when
 * the value is valid.
 *
 * @param unauthorizedMessage - what a 401 means for this specific route. Public
 *   routes carry a path API key rather than a Cloudflare Access JWT, and the
 *   copy-paste had left both variants claiming to be the other.
 */
function errorResponses(unauthorizedMessage: string, options: { notFound?: boolean } = {}) {
  return {
    '400': { description: 'The request failed validation.', content: jsonContent() },
    '401': {
      description: 'The request is not authenticated.',
      content: jsonContent({ Exception: { Type: 'Unauthorized', Message: unauthorizedMessage } }),
    },
    ...(options.notFound && { '404': { description: 'The resource was not found.', content: jsonContent() } }),
    '500': {
      description: 'The request failed unexpectedly. Details are logged server-side, not returned.',
      content: jsonContent(),
    },
  };
}

/**
Message shown when a `/user/*` route is called without a valid Access token.
*/
const UNAUTHORIZED_ACCESS_MESSAGE = 'No Cloudflare Access JWT token provided in request headers.';

/**
Message shown when a public route is called with a missing or invalid API key.
*/
const UNAUTHORIZED_API_KEY_MESSAGE = 'The API key is invalid or expired.';

/**
`security` block for routes behind Cloudflare Access.
*/
const CLOUDFLARE_ACCESS_SECURITY = [{ CloudflareAccess: [] }];

/**
`security` block for routes authenticated by a path API key.
*/
const API_KEY_SECURITY = [{ ApiKeyInPath: [] }];

/**
 * The OAuth2 callback has no credential of its own; it is bound by a one-time
 * `state` plus PKCE, so naming a scheme for it would be misleading.
 */
const NO_SECURITY: never[] = [];

/**
 * Security schemes and shared schemas, merged into the generated document.
 *
 * Written structurally rather than imported from `openapi3-ts`, which reaches
 * this project only transitively through chanfana.
 */
const OPENAPI_COMPONENTS = {
  securitySchemes: {
    CloudflareAccess: {
      type: 'apiKey' as const,
      in: 'header' as const,
      name: 'cf-access-jwt-assertion',
      description: 'Cloudflare Access JWT issued to the browser session. Verified against the team JWKS endpoint.',
    },
    ApiKeyInPath: {
      type: 'apiKey' as const,
      in: 'path' as const,
      name: 'api_key',
      description: 'Per-application API key embedded in the path. Stored hashed; only a prefix is retained.',
    },
  },
  schemas: {
    Exception: EXCEPTION_SCHEMA,
    UserLimits: {
      type: 'object' as const,
      properties: {
        maxApplicationsPerUser: { type: 'integer' as const },
        maxApiKeysPerApplication: { type: 'integer' as const },
        defaultApiKeyExpiryDays: { type: 'integer' as const },
        maxApiKeyExpiryDays: { type: 'integer' as const },
      },
    },
  },
};

export {
  API_KEY_SECURITY,
  CLOUDFLARE_ACCESS_SECURITY,
  EXCEPTION_SCHEMA,
  NO_SECURITY,
  OPENAPI_COMPONENTS,
  UNAUTHORIZED_ACCESS_MESSAGE,
  UNAUTHORIZED_API_KEY_MESSAGE,
  errorResponses,
};
