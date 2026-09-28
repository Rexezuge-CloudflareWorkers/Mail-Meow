import { OpenAPIRoute } from 'chanfana';
import { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { BadRequestError, DefaultInternalServerError, ServiceError } from '@mail-meow/backend-errors';
import { validateRequestInput } from '@mail-meow/shared/schema';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';

abstract class IBaseRoute<TRequest extends IRequest, TResponse extends IResponse, TEnv extends IEnv> extends OpenAPIRoute {
  async handle(c: RouteContext<TEnv>) {
    try {
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      const validationResult = await validateRequestInput(c.req.raw, body);
      if (!validationResult.success) {
        throw new BadRequestError(validationResult.error);
      }
      const validatedBody: unknown = validationResult.data;
      const request: TRequest = { ...(validatedBody as TRequest), raw: c.req.raw };
      const response: TResponse | ExtendedResponse<TResponse> = await this.handleRequest(request, c.env, c);
      return this.toResponse(response, c);
    } catch (error: unknown) {
      return this.toErrorResponse(error, c);
    }
  }

  protected abstract handleRequest(request: TRequest, env: TEnv, cxt: RouteContext<TEnv>): Promise<TResponse | ExtendedResponse<TResponse>>;

  protected toResponse(response: TResponse | ExtendedResponse<TResponse>, c: RouteContext<TEnv>) {
    if (
      response &&
      typeof response === 'object' &&
      ('body' in response || 'rawBody' in response || 'statusCode' in response || 'headers' in response)
    ) {
      const extendedResponse: ExtendedResponse<TResponse> = response;
      const statusCode: number = extendedResponse.statusCode || 200;
      const headers = Object.entries(extendedResponse.headers ?? {});
      for (const [key, value] of headers) {
        c.header(key, value);
      }
      c.status(statusCode as ContentfulStatusCode);
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

  protected toErrorResponse(error: unknown, c: RouteContext<TEnv>) {
    // Typed service errors (including NotFoundError/DatabaseError and 5xx
    // domain errors) map to their own status/type/message. Only untyped errors
    // are masked as internal errors.
    if (error instanceof ServiceError) {
      const log = error.getErrorCode() < 500 ? console.warn : console.error;
      log(`Responding with ${error.getErrorType()}`);
      return c.json({ Exception: { Type: error.getErrorType(), Message: this.clientFacingMessage(error) } }, error.getErrorCode());
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
   * authored for the caller and are returned as-is, after redaction as a
   * backstop. The unsanitized text still reaches the log above.
   */
  private clientFacingMessage(error: ServiceError): string {
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IEnv {}

interface ExtendedResponse<TResponse extends IResponse> {
  body?: TResponse;
  rawBody?: BodyInit | null;
  statusCode?: ContentfulStatusCode;
  headers?: Record<string, string>;
}

type RouteContext<TEnv extends IEnv> = Context<{ Bindings: Env } & TEnv>;

export { IBaseRoute };
export type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext };
