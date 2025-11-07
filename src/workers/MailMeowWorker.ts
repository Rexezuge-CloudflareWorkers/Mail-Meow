import { fromHono } from 'chanfana';
import { Hono } from 'hono';
import { AbstractWorker } from '@/base';
import { SendEmail } from '@/endpoints/send-email';
import { RegisterUser } from '@/endpoints/register-user';
import { BindOAuth } from '@/endpoints/bind-oauth';
import { GenerateApiKey } from '@/endpoints/generate-api-key';
import { DeleteBoundOAuth } from '@/endpoints/delete-oauth';
import { RebindOAuth } from '@/endpoints/rebind-oauth';
import { DeleteApiKey } from '@/endpoints/delete-api-key';
import { DeleteUser } from '@/endpoints/delete-user';

export class MailMeowWorker extends AbstractWorker {
  private app: Hono;
  private openapi: any;

  constructor() {
    super();
    this.app = new Hono();
    this.openapi = fromHono(this.app, { docs_url: '/' });
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Register API endpoints
    this.openapi.post('/api/user', RegisterUser); // User registration
    this.openapi.delete('/api/user', DeleteUser); // User deletion
    this.openapi.post('/api/user/api_key', GenerateApiKey); // Generate API Key
    this.openapi.delete('/api/user/api_key', DeleteApiKey); // Delete API Key

    this.openapi.post('/api/:api_key/oauth', BindOAuth); // Bind OAuth
    this.openapi.put('/api/:api_key/oauth', RebindOAuth); // Rebind OAuth
    this.openapi.delete('/api/:api_key/oauth', DeleteBoundOAuth); // Delete OAuth
    this.openapi.post('/api/:api_key/email', SendEmail); // Send Email
  }

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return this.app.fetch(request, env, ctx);
  }
}
