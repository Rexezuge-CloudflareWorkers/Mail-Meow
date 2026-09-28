import { describe, expect, it } from 'vitest';
import { MailMeowWorker } from '@/workers/MailMeowWorker';
import {
  API_KEY_SECURITY,
  CLOUDFLARE_ACCESS_SECURITY,
  NO_SECURITY,
  OPENAPI_COMPONENTS,
  UNAUTHORIZED_ACCESS_MESSAGE,
  UNAUTHORIZED_API_KEY_MESSAGE,
  errorResponses,
} from '@/openapi/components';

interface OpenAPIDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, { security?: Array<Record<string, string[]>>; responses: Record<string, unknown> }>>;
  components?: {
    securitySchemes?: Record<string, { type: string; in: string; name: string }>;
    schemas?: Record<string, unknown>;
  };
}

/** Builds the document the worker actually serves. */
function generatedDocument(): OpenAPIDocument {
  const worker = new MailMeowWorker();
  const router = worker as unknown as { app: { schema: OpenAPIDocument } };
  return router.app.schema;
}

describe('generated OpenAPI document', () => {
  const document = generatedDocument();

  it('exposes the API metadata', () => {
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe('Mail-Meow API');
  });

  it('documents every registered route', () => {
    // Regression guard: a route registered on the worker but missing from the
    // document is invisible to anyone generating a client from it.
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/user/me',
        '/user/applications',
        '/user/application',
        '/user/application/oauth2/authorize',
        '/user/application/api-keys',
        '/user/application/api-key',
        '/user/processing/task-runs',
        '/user/processing/run-task',
        '/api/oauth2/callback/{applicationId}',
        '/api/{api_key}/email',
        '/api/{api_key}/sns',
      ]),
    );
  });

  it('declares every security scheme its routes reference', () => {
    // The core defect this fixes: twelve routes declared
    // `security: [{ CloudflareAccess: [] }]` while the document defined no such
    // scheme, so every consumer saw a dangling requirement.
    const schemes = document.components?.securitySchemes ?? {};
    expect(Object.keys(schemes).sort()).toEqual(['ApiKeyInPath', 'CloudflareAccess']);
    expect(schemes.CloudflareAccess).toMatchObject({ type: 'apiKey', in: 'header', name: 'cf-access-jwt-assertion' });
    expect(schemes.ApiKeyInPath).toMatchObject({ type: 'apiKey', in: 'path', name: 'api_key' });
  });

  it('references only declared schemes', () => {
    const declared = new Set(Object.keys(document.components?.securitySchemes ?? {}));
    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        for (const requirement of operation.security ?? []) {
          for (const name of Object.keys(requirement)) {
            expect(declared, `${method.toUpperCase()} ${path} references undeclared scheme ${name}`).toContain(name);
          }
        }
      }
    }
  });

  it('marks the protected routes with the Access scheme', () => {
    expect(document.paths['/user/me'].get?.security).toEqual(CLOUDFLARE_ACCESS_SECURITY);
  });

  it('marks the public delivery routes with the path API key scheme', () => {
    expect(document.paths['/api/{api_key}/email'].post?.security).toEqual(API_KEY_SECURITY);
    expect(document.paths['/api/{api_key}/sns'].post?.security).toEqual(API_KEY_SECURITY);
  });

  it('declares no scheme for the OAuth2 callback, which is bound by one-time state', () => {
    expect(document.paths['/api/oauth2/callback/{applicationId}'].get?.security).toEqual(NO_SECURITY);
  });

  it('shares the Exception schema instead of inlining it per route', () => {
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(expect.arrayContaining(Object.keys(OPENAPI_COMPONENTS.schemas)));
  });
});

describe('errorResponses', () => {
  it('always describes 400, 401, and 500', () => {
    const responses = errorResponses(UNAUTHORIZED_ACCESS_MESSAGE);
    expect(Object.keys(responses).sort()).toEqual(['400', '401', '500']);
  });

  it('adds 404 only when the route can miss a resource', () => {
    expect(errorResponses(UNAUTHORIZED_ACCESS_MESSAGE, { notFound: true })).toHaveProperty('404');
  });

  it('uses the caller-supplied unauthorized message', () => {
    expect(JSON.stringify(errorResponses(UNAUTHORIZED_API_KEY_MESSAGE))).toContain(UNAUTHORIZED_API_KEY_MESSAGE);
  });
});
