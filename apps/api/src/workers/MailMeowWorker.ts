import { AbstractEntrypointWorker } from '@mail-meow/backend-runtime/base';
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
  ListBackgroundTaskRunsRoute,
  OAuth2CallbackRoute,
  RunTaskNowRoute,
  SendEmailRoute,
  SendSNSRoute,
  UpdateApplicationRoute,
  UpdateCurrentUserRoute,
} from '@/endpoints';
import { MiddlewareHandlers } from '@/middleware';
import { OPENAPI_COMPONENTS } from '@/openapi/components';
import { SPA_HTML } from '@/generated/spa-shell';
import { DURABLE_OBJECT_CRON_TASKS_RUN_URL, DURABLE_OBJECT_NAMESPACE_GLOBAL } from '@mail-meow/backend-runtime/constants';
import { createD1SessionEnv } from '@mail-meow/backend-data/utils';

const D1_BOOKMARK_HEADER: string = 'x-d1-bookmark';

/**
 * The slice of zod-to-openapi's registry that chanfana re-exports.
 *
 * Declared structurally because `openapi3-ts` and
 * `@asteasolutions/zod-to-openapi` reach this project only transitively,
 * through chanfana.
 */
interface OpenAPIComponentRegistrar {
  registerComponent(type: 'securitySchemes' | 'schemas', name: string, component: Record<string, unknown>): unknown;
}

/**
The router plus the registry chanfana attaches to it.
*/
interface RouterWithRegistry {
  registry: OpenAPIComponentRegistrar;
}

type AppRouter = HonoOpenAPIRouterType<{
  Bindings: Env;
  Variables: { AuthenticatedUserEmailAddress: string };
}>;

class MailMeowWorker extends AbstractEntrypointWorker {
  protected readonly app: AppRouter;

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
    app.get('/user', (c) => c.redirect('/user/' + new URL(c.req.url).search));
    app.options('/user/*', (_c) => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': `Content-Type, Authorization, cf-access-jwt-assertion, ${D1_BOOKMARK_HEADER}`,
          'Access-Control-Expose-Headers': D1_BOOKMARK_HEADER,
          'Access-Control-Max-Age': '86400',
        },
      });
    });

    app.use('/user/*', MiddlewareHandlers.userAuthentication());

    const openapi: AppRouter = fromHono(app, {
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

    MailMeowWorker.withSecuritySchemes(openapi);

    this.registerUserRoutes(openapi);
    this.registerPublicApiRoutes(openapi);

    app.get('*', (c) => {
      const path: string = new URL(c.req.url).pathname;
      if (!path.startsWith('/user/')) {
        return c.notFound();
      }
      return c.html(SPA_HTML);
    });

    this.app = openapi;
  }

  /**
   * Registers the security schemes the routes reference.
   *
   * The `/user/*` routes declare `security: [{ CloudflareAccess: [] }]`, but
   * `fromHono` builds `components` from the route schemas alone, so the
   * generated document referenced a scheme it never defined and every consumer
   * of `/openapi.json` saw a dangling requirement.
   *
   * Registering through the registry rather than patching the response means
   * the JSON, the YAML, and the Swagger UI all read the same document.
   */
  private static withSecuritySchemes(openapi: AppRouter): void {
    // `HonoOpenAPIRouterType` does not re-expose `registry` even though the
    // router implements it, so reach it through a structural view.
    const registry = (openapi as unknown as RouterWithRegistry).registry;
    for (const [name, scheme] of Object.entries(OPENAPI_COMPONENTS.securitySchemes)) {
      registry.registerComponent('securitySchemes', name, scheme);
    }
    for (const [name, schema] of Object.entries(OPENAPI_COMPONENTS.schemas)) {
      registry.registerComponent('schemas', name, schema);
    }
  }

  private registerUserRoutes(openapi: AppRouter): void {
    openapi.get('/user/me', GetCurrentUserRoute);
    openapi.put('/user/me', UpdateCurrentUserRoute);
    openapi.get('/user/applications', ListApplicationsRoute);
    openapi.post('/user/application', CreateApplicationRoute);
    openapi.put('/user/application', UpdateApplicationRoute);
    openapi.delete('/user/application', DeleteApplicationRoute);
    openapi.post('/user/application/oauth2/authorize', CreateOAuth2AuthorizationRoute);
    openapi.get('/user/application/api-keys', ListApplicationApiKeysRoute);
    openapi.post('/user/application/api-key', CreateApplicationApiKeyRoute);
    openapi.delete('/user/application/api-key', DeleteApplicationApiKeyRoute);
    openapi.get('/user/processing/task-runs', ListBackgroundTaskRunsRoute);
    openapi.post('/user/processing/run-task', RunTaskNowRoute);
  }

  private registerPublicApiRoutes(openapi: AppRouter): void {
    openapi.get('/api/oauth2/callback/:applicationId', OAuth2CallbackRoute);
    openapi.post('/api/:api_key/email', SendEmailRoute);
    openapi.post('/api/:api_key/sns', SendSNSRoute);
  }

  protected async onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path: string = new URL(request.url).pathname;
    if (!MailMeowWorker.shouldUseD1Session(path, env)) {
      return this.app.fetch(request, env, ctx);
    }

    const isUserRequest: boolean = path.startsWith('/user/');
    const incomingBookmark: string | undefined = isUserRequest ? request.headers.get(D1_BOOKMARK_HEADER)?.trim() || undefined : undefined;
    const sessionEnv = createD1SessionEnv(env, incomingBookmark || 'first-primary');
    const response: Response = await this.app.fetch(request, sessionEnv, ctx);
    if (isUserRequest) {
      const bookmark: D1SessionBookmark | null = sessionEnv.DB.getBookmark();
      if (bookmark) {
        response.headers.set(D1_BOOKMARK_HEADER, bookmark);
      }
      response.headers.set('Access-Control-Expose-Headers', D1_BOOKMARK_HEADER);
    }
    return response;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- forwards via ctx.waitUntil, no direct await
  protected async onScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const cronTasksId: DurableObjectId = (env as unknown as { CRON_TASKS: DurableObjectNamespace }).CRON_TASKS.idFromName(
      DURABLE_OBJECT_NAMESPACE_GLOBAL,
    );
    const cronTasksStub = (env as unknown as { CRON_TASKS: DurableObjectNamespace }).CRON_TASKS.get(cronTasksId);
    const cronTasksRequest: Request = new Request(DURABLE_OBJECT_CRON_TASKS_RUN_URL, {
      method: 'POST',
      body: JSON.stringify({
        cron: event.cron,
        scheduledTime: event.scheduledTime,
      }),
    });

    ctx.waitUntil(
      cronTasksStub
        .fetch(cronTasksRequest)
        .then(async (response: Response): Promise<void> => {
          if (!response.ok && response.status !== 202) {
            console.error('CronTasksWorker returned an error response:', response.status, await response.text());
          }
        })
        .catch((error: unknown): void => {
          console.error('Failed to invoke CronTasksWorker:', error);
        }),
    );
  }

  private static shouldUseD1Session(path: string, env: Env): boolean {
    if (!path.startsWith('/user/') && !path.startsWith('/api/')) {
      return false;
    }
    const database = (env as { DB?: { withSession?: unknown } }).DB;
    return typeof database?.withSession === 'function';
  }
}

export { MailMeowWorker };
