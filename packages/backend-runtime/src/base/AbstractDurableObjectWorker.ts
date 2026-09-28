import { DurableObject } from 'cloudflare:workers';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

type DurableObjectFetchRequest = Parameters<NonNullable<DurableObject<Env>['fetch']>>[0];
type DurableObjectFetchResult = ReturnType<NonNullable<DurableObject<Env>['fetch']>>;
type DurableObjectFetchResponse = Awaited<DurableObjectFetchResult>;

abstract class AbstractDurableObjectWorker extends DurableObject<Env> {
  public async fetch(request: DurableObjectFetchRequest): Promise<DurableObjectFetchResponse> {
    try {
      return await this.onRequest(request);
    } catch (err: unknown) {
      console.error('Unhandled error in durable object fetch():', ErrorSanitizationUtil.sanitizeErrorForLogging(err));
      return Response.json({ error: 'Internal Error' }, { status: 500 });
    }
  }

  protected createExecutionContext(): ExecutionContext {
    return {
      waitUntil: (promise: Promise<unknown>): void => this.ctx.waitUntil(promise),
      passThroughOnException: (): void => undefined,
    } as unknown as ExecutionContext;
  }

  protected abstract onRequest(request: DurableObjectFetchRequest): Promise<DurableObjectFetchResponse>;
}

export { AbstractDurableObjectWorker };
