import { MailMeowWorker } from '@/workers';
import { AbstractWorker } from '@/base';

const worker: AbstractWorker = new MailMeowWorker();

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext): Promise<Response> => worker.fetch(req, env, ctx),
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> => worker.scheduled(event, env, ctx),
} satisfies ExportedHandler<Env>;
