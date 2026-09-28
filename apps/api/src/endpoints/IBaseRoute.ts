import { OpenAPIRoute } from 'chanfana';
import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { BadRequestError } from '@mail-meow/backend-errors';
import { validateRequestInput } from '@mail-meow/shared/schema';
import { toErrorResponse } from '@/errors/errorResponse';

/**
 * Hono context for every route.
 *
 * `AuthenticatedUserEmailAddress` is populated by
 * `MiddlewareHandlers.userAuthentication`, which runs on `/user/*` only. It is
 * declared on the shared type so `IUserRoute` can read it without threading a
 * context generic through every route; public routes simply never read it.
 */
type RouteContext = Context<{
  Bindings: Env;
  Variables: { AuthenticatedUserEmailAddress: string; AuthenticatedUserId: string };
}>;

/**
 * Base for every route.
 *
 * The environment is the generated Workers `Env`, not a per-route hand-pruned
 * subset. The subsets were a type fiction: they listed two or three bindings
 * while the handler passed `env` straight through to a service needing six, so
 * the mismatch was hidden behind `c.env as TEnv` and only surfaced at runtime.
 */
abstract class IBaseRoute<TRequest extends IRequest, TResponse extends IResponse> extends OpenAPIRoute {
  /**
   * Parses and validates the body, runs the handler, and shapes the response.
   *
   * Subclasses extend this by overriding `enrichRequest` (to attach resolved
   * collaborators such as the application behind an API key), not by
   * re-implementing the flow.
   */
  async handle(c: RouteContext) {
    try {
      const body: unknown = await IBaseRoute.parseBody(c.req.raw);
      const validationResult = await validateRequestInput(c.req.raw, body);
      if (!validationResult.success) {
        throw new BadRequestError(validationResult.error);
      }
      const request = await this.enrichRequest({ ...(validationResult.data as TRequest), raw: c.req.raw }, c);
      const response: TResponse | ExtendedResponse<TResponse> = await this.handleRequest(request, c.env, c);
      return this.toResponse(response, c);
    } catch (error: unknown) {
      return this.toErrorResponse(error, c);
    }
  }

  /**
   * Hook for subclasses that need to resolve something before the handler runs.
   * The default is identity.
   */
  protected enrichRequest(request: TRequest, _c: RouteContext): Promise<TRequest> {
    return Promise.resolve(request);
  }

  protected abstract handleRequest(request: TRequest, env: Env, cxt: RouteContext): Promise<TResponse | ExtendedResponse<TResponse>>;

  /**
  A missing or malformed body is `{}`, not an error: query-only routes send none.
  */
  private static async parseBody(raw: Request): Promise<unknown> {
    try {
      return await raw.json();
    } catch {
      return {};
    }
  }

  protected toResponse(response: TResponse | ExtendedResponse<TResponse>, c: RouteContext) {
    if (
      response &&
      typeof response === 'object' &&
      ('body' in response || 'rawBody' in response || 'statusCode' in response || 'headers' in response)
    ) {
      const extendedResponse: ExtendedResponse<TResponse> = response;
      const statusCode: number = extendedResponse.statusCode || 200;
      const headers: Array<[string, string]> = Object.entries(extendedResponse.headers ?? {});
      for (const [key, value] of headers) {
        c.header(key, value);
      }
      c.status(statusCode as ContentfulStatusCode);
      // A redirect carries no body; Hono needs the empty response set explicitly.
      if (statusCode >= 300 && statusCode < 400) {
        return c.body(null);
      }
      if ('rawBody' in extendedResponse) {
        return c.body((extendedResponse.rawBody ?? null) as never);
      }
      return c.json(extendedResponse.body);
    }
    return c.json(response);
  }

  protected getQueryParam(request: IRequest, name: string): string | undefined {
    return new URL(request.raw.url).searchParams.get(name) ?? undefined;
  }

  protected toErrorResponse(error: unknown, c: RouteContext) {
    // The disclosure decision lives in one place (`toErrorResponse` in
    // backend-errors) and is shared with the auth middleware. It used to be
    // written twice, and the two copies had already diverged: the middleware
    // skipped the 5xx message substitution and the untyped-error masking, so
    // the same failure returned different bodies depending on which layer
    // caught it.
    //
    // This layer always answers rather than rethrowing. The entrypoint's
    // catch-all returns a bare `Internal Error` *text* body, so rethrowing here
    // would replace the documented `{ Exception: … }` envelope with an
    // unparseable 500. `shouldRethrow` is for the auth middleware, which is not
    // inside a route and has no envelope of its own to fall back on.
    const response = toErrorResponse(error);
    if (response.logDetail === null) {
      const log = response.status < 500 ? console.warn : console.error;
      log(`Responding with ${response.body.Exception.Type}`);
    } else {
      // An untyped error can carry a provider response body or an Authorization
      // header, so it is redacted before it reaches the log.
      console.error('Caught an untyped error during execution:', response.logDetail);
    }
    return c.json(response.body, response.status);
  }
}

interface IRequest {
  raw: Request;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IResponse {}

interface ExtendedResponse<TResponse extends IResponse> {
  body?: TResponse;
  rawBody?: BodyInit | null;
  statusCode?: ContentfulStatusCode;
  headers?: Record<string, string>;
}

export { IBaseRoute };
export type { ExtendedResponse, IRequest, IResponse, RouteContext };
