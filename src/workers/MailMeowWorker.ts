import { fromHono, HonoOpenAPIRouterType } from 'chanfana';
import { Hono } from 'hono';
import { AbstractWorker } from '@/base';
import { SendEmail } from '@/endpoints/send-email';
import { SendSNS } from '@/endpoints/send-sns';
import { RegisterUser } from '@/endpoints/register-user';
import { BindOAuth } from '@/endpoints/bind-oauth';
import { GenerateApiKey } from '@/endpoints/generate-api-key';
import { DeleteBoundOAuth } from '@/endpoints/delete-oauth';
import { RebindOAuth } from '@/endpoints/rebind-oauth';
import { DeleteApiKey } from '@/endpoints/delete-api-key';
import { DeleteUser } from '@/endpoints/delete-user';
import { GenerateMasterKey } from '@/endpoints/generate-master-key';

export class MailMeowWorker extends AbstractWorker {
  protected readonly app: Hono<{ Bindings: Env }>;

  constructor() {
    super();

    const app: Hono<{
      Bindings: Env;
    }> = new Hono<{ Bindings: Env }>();
    const openapi: HonoOpenAPIRouterType<{
      Bindings: Env;
    }> = fromHono(app, {
      docs_url: '/docs',
    });

    // Register API endpoints
    openapi.post('/api/user', RegisterUser); // User registration
    openapi.delete('/api/user', DeleteUser); // User deletion
    openapi.post('/api/user/api_key', GenerateApiKey); // Generate API Key
    openapi.delete('/api/user/api_key', DeleteApiKey); // Delete API Key

    openapi.post('/api/:api_key/oauth', BindOAuth); // Bind OAuth or SNS
    openapi.put('/api/:api_key/oauth', RebindOAuth); // Rebind OAuth
    openapi.delete('/api/:api_key/oauth', DeleteBoundOAuth); // Delete OAuth
    openapi.post('/api/:api_key/email', SendEmail); // Send Email or SNS
    openapi.post('/api/:api_key/sns', SendSNS); // Send SNS message

    openapi.post('/api/crypto/generate-master-key', GenerateMasterKey); // Generate master key

    this.app = openapi;
  }

  protected async handleFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return this.app.fetch(request, env, ctx);
  }

  protected async handleScheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {}
}
