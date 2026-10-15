import { AbstractEntrypointWorker } from '@rexezuge/runtime';
import { ErrorSanitizationUtil } from '@rexezuge/shared';

/**
 * Mail-Meow's entrypoint base.
 *
 * The kit's `AbstractEntrypointWorker` is byte-identical in all nine repos, and
 * this one differed from it in exactly one way worth keeping: the sink for an
 * unhandled rejection.
 *
 * The kit's default hands the caught value to `console.error` verbatim, which is
 * only safe when nothing in the call path can carry a secret. Every path here
 * can — a D1 error names tables and columns, a provider response can carry an
 * `Authorization` header, and the entrypoint's `onRequest` sits behind all of
 * them. So the base's hook is overridden with a redacting sink, and the static
 * message the kit supplies is kept as the first argument: the sanitized pair is
 * then the only thing a log line contains.
 *
 * That is also why `ErrorSanitizationUtil.sanitizeErrorForLogging` is the call
 * and not a hand-rolled redaction — its `.replaceAll` acts as a CodeQL
 * `js/clear-text-logging` masking barrier, which only applies if the sanitizer
 * is what performs the substitution.
 *
 * The kit also removed the `/__scheduled` branch this used to carry. That branch
 * ran before `onRequest`, which made `GET /__scheduled` an unauthenticated,
 * un-rated trigger for the cron Durable Object — it bypassed the app's security
 * headers, its request scope, and its rate limits, and any caller could fire the
 * scheduled work on demand. Nothing needed it: `triggers.crons` in the wrangler
 * config is how cron actually runs.
 */
abstract class MailMeowEntrypointWorker extends AbstractEntrypointWorker {
  protected override reportUnhandled(message: string, error: unknown): void {
    console.error(message, ErrorSanitizationUtil.sanitizeErrorForLogging(error));
  }
}

export { MailMeowEntrypointWorker as AbstractEntrypointWorker };
export type { WorkerExecutionContext, WorkerScheduledController } from '@rexezuge/runtime';
