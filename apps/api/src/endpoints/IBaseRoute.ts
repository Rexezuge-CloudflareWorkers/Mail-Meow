import { OpenAPIRoute } from 'chanfana';
import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { BadRequestError, DefaultInternalServerError, ServiceError } from '@mail-meow/backend-errors';
import { validateRequestInput } from '@mail-meow/shared/schema';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

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
    // Typed service errors (including NotFoundError/DatabaseError and 5xx domain
    // errors) map to their own status/type/message. Untyped errors are masked.
    if (error instanceof ServiceError) {
      const log = error.getErrorCode() < 500 ? console.warn : console.error;
      log(`Responding with ${error.getErrorType()}`);
      return c.json({ Exception: { Type: error.getErrorType(), Message: IBaseRoute.clientFacingMessage(error) } }, error.getErrorCode());
    }
    console.error('Caught an untyped error during execution:', error);
    return c.json(
      {
        Exception: {
          Type: DefaultInternalServerError.getErrorType(),
          Message: DefaultInternalServerError.getErrorMessage(),
        },
      },
      DefaultInternalServerError.getErrorCode(),
    );
  }

  /**
   * Decides what the caller is allowed to see.
   *
   * 5xx messages are built from raw D1 errors and provider response bodies, so
   * passing them through verbatim handed API clients internal detail (table and
   * column names, and whatever the provider echoed back). 4xx messages are
   * authored for the caller and returned as-is, after redaction as a backstop.
   * The unsanitized text still reaches the log above.
   */
  private static clientFacingMessage(error: ServiceError): string {
    if (error.getErrorCode() >= 500) {
      return DefaultInternalServerError.getErrorMessage();
    }
    return ErrorSanitizationUtil.sanitizeMessage(error.getErrorMessage());
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
