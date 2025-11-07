abstract class AbstractWorker {
  protected printExecId(): string {
    const execId: string = crypto.randomUUID();
    console.log('🧭 Worker Execution ID:', execId);
    return execId;
  }

  public async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url: URL = new URL(request.url);
    if ('/__scheduled' === url.pathname) {
      // Create a mock ScheduledController for manual trigger
      const mockScheduledController = {
        scheduledTime: Date.now(),
        cron: '',
        noRetry: () => {},
      } as ScheduledController;
      await this.scheduled(mockScheduledController, env, ctx);
      return new Response(null, { status: 204 });
    }

    this.printExecId();
    console.log('🔁 Worker triggered by HTTP request');
    try {
      return await this.handleFetch(request, env, ctx);
    } catch (err: unknown) {
      console.error('❌ Unhandled error in fetch():', err);
      return new Response('Internal Error', { status: 500 });
    }
  }

  public async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    this.printExecId();
    console.log('⏭️ Worker triggered by Cron schedule');
    try {
      await this.handleScheduled(event, env, ctx);
    } catch (err: unknown) {
      console.error('❌ Unhandled error in scheduled():', err);
    }
  }

  protected abstract handleFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;

  protected abstract handleScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void>;
}

export { AbstractWorker };
