import { OpenAPIRoute } from 'chanfana';
import { Context } from 'hono';
import { InternalServerError } from '@/error';
import { VoidUtil } from '@/utils';

abstract class IAPIRoute<TRequest extends IRequest, TResponse extends IResponse, TEnv extends IEnv> extends OpenAPIRoute {
  async handle(c: APIContext<TEnv>) {
    try {
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch (_ignored: unknown) {
        VoidUtil.void(_ignored);
        body = {};
      }
      const request: TRequest = body as TRequest;
      const response: TResponse = await this.handleRequest(request, c.env as TEnv, c);
      return c.json(response);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Caught error during execution: ', error);

        // Check if it's a service error with statusCode
        if ('statusCode' in error && typeof error.statusCode === 'number') {
          return c.json({ error: error.message }, error.statusCode as any);
        }
      }

      console.warn('Responding with InternalServerError');
      const internalError = new InternalServerError();
      return c.json({ error: internalError.message }, internalError.statusCode as any);
    }
  }

  protected abstract handleRequest(request: TRequest, env: TEnv, ctx: APIContext<TEnv>): Promise<TResponse>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IResponse {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IEnv {}

type APIContext<TEnv extends IEnv> = Context<{ Bindings: Env } & TEnv>;

export { IAPIRoute };
export type { IRequest, IResponse, IEnv, APIContext };
