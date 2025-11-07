export abstract class AbstractWorker {
  abstract fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Default implementation - can be overridden by subclasses
    console.log('Scheduled event triggered');
  }

  protected handleError(error: unknown): Response {
    console.error('Worker error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }

  protected async handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await this.fetch(request, env, ctx);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
