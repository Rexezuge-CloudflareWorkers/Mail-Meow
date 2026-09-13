import { MailMeowWorker } from '@/workers';
export { CronTasksWorker, OAuth2TokenRefreshWorker } from '@mail-meow/background';

const mailMeowWorker: MailMeowWorker = new MailMeowWorker();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return mailMeowWorker.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    return mailMeowWorker.scheduled(controller, env, ctx);
  },
};
