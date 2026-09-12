import { AbstractEntrypointWorker } from '@/base';
import { fromHono, HonoOpenAPIRouterType } from 'chanfana';
import { Hono } from 'hono';
import {
  CreateApplicationApiKeyRoute,
  CreateApplicationRoute,
  CreateOAuth2AuthorizationRoute,
  DeleteApplicationApiKeyRoute,
  DeleteApplicationRoute,
  GetCurrentUserRoute,
  ListApplicationApiKeysRoute,
  ListApplicationsRoute,
  OAuth2CallbackRoute,
  SendEmailRoute,
  SendSNSRoute,
  UpdateApplicationRoute,
} from '@/endpoints';
import { MiddlewareHandlers } from '@/middleware';
import { SPA_HTML } from '@/generated/spa-shell';

class MailMeowWorker extends AbstractEntrypointWorker {
  protected readonly app: HonoOpenAPIRouterType<{
    Bindings: Env;
    Variables: { AuthenticatedUserEmailAddress: string };
  }>;

  constructor() {
    super();

    const app: Hono<{
      Bindings: Env;
      Variables: { AuthenticatedUserEmailAddress: string };
    }> = new Hono<{
      Bindings: Env;
      Variables: { AuthenticatedUserEmailAddress: string };
    }>();

    app.get('/', (c) => c.redirect('/user/'));
    app.get('/user', (c) => c.redirect('/user/'));
    app.options('/user/*', () => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, cf-access-jwt-assertion',
          'Access-Control-Max-Age': '86400',
        },
      });
    });

    app.use('/user/*', MiddlewareHandlers.userAuthentication());

    const openapi: HonoOpenAPIRouterType<{
      Bindings: Env;
      Variables: { AuthenticatedUserEmailAddress: string };
    }> = fromHono(app, {
      docs_url: '/docs',
      openapi_url: '/openapi.json',
      schema: {
        info: {
          title: 'Mail-Meow API',
          version: '3.0.0',
          description:
            'Cloudflare Worker API for managing connected email/SNS applications and delivering messages. Routes under /user/* are protected by Cloudflare Access (authenticated user email). Public delivery endpoints under /api/:api_key/* use a per-application API key embedded in the path. The OAuth2 callback under /api/oauth2/callback/:applicationId is public and secured by short-lived one-time state plus PKCE.',
        },
      },
    });

    openapi.get('/user/me', GetCurrentUserRoute);
    openapi.get('/user/applications', ListApplicationsRoute);
    openapi.post('/user/application', CreateApplicationRoute);
    openapi.put('/user/application', UpdateApplicationRoute);
    openapi.delete('/user/application', DeleteApplicationRoute);
    openapi.post('/user/application/oauth2/authorize', CreateOAuth2AuthorizationRoute);
    openapi.get('/user/application/api-keys', ListApplicationApiKeysRoute);
    openapi.post('/user/application/api-key', CreateApplicationApiKeyRoute);
    openapi.delete('/user/application/api-key', DeleteApplicationApiKeyRoute);

    openapi.get('/api/oauth2/callback/:applicationId', OAuth2CallbackRoute);
    openapi.post('/api/:api_key/email', SendEmailRoute);
    openapi.post('/api/:api_key/sns', SendSNSRoute);

    app.get('/user/*', (c) => {
      return c.html(SPA_HTML);
    });

    this.app = openapi;
  }

  protected async onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return this.app.fetch(request, env, ctx);
  }

  protected async onScheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {}
}

export { MailMeowWorker };
