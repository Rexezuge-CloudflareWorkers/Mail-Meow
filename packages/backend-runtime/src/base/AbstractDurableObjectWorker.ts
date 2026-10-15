import { AbstractDurableObjectWorker } from '@rexezuge/runtime';
import { ErrorSanitizationUtil } from '@rexezuge/shared';

/**
 * Mail-Meow's Durable Object base: the kit's, with a redacting sink.
 *
 * Same reasoning as `AbstractEntrypointWorker` — the kit's base is byte-identical
 * across the family and its default `console.error(message, error)` is unsafe for
 * a Worker whose DO handles OAuth2 token exchange and refresh, where the caught
 * value can be a provider response body carrying an `Authorization` header.
 *
 * `createExecutionContext` is inherited unchanged: the kit's version is
 * Mail-Meow's version, which is what its own header says it converged from.
 */
/**
 * `TEnv` is unbounded rather than defaulted to the Workers `Env`.
 *
 * The previous signature wrote `extends AbstractDurableObjectWorker` with no
 * parameter, which resolved to `Env` — a global declared in the *consuming*
 * worker's `types.d.ts`. That is invisible from this package, and the moment
 * another package imports `base` it stops compiling. `TEnv` defaults to nothing
 * structurally and each concrete DO supplies its own binding type, which is what
 * the kit's base intends.
 */
abstract class MailMeowDurableObjectWorker<TEnv = unknown> extends AbstractDurableObjectWorker<TEnv> {
  protected override reportUnhandled(message: string, error: unknown): void {
    console.error(message, ErrorSanitizationUtil.sanitizeErrorForLogging(error));
  }
}

export { MailMeowDurableObjectWorker as AbstractDurableObjectWorker };
