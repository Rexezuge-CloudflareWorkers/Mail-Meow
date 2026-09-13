import { Tokens, createRequestScope } from '@mail-meow/backend-services/composition';
import { BadRequestError } from '@mail-meow/backend-errors';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';



class OAuth2CallbackRoute extends IBaseRoute<OAuth2CallbackRequest, OAuth2CallbackResponse, OAuth2CallbackEnv> {
  schema = {
    tags: ['OAuth2'],
    summary: 'OAuth2 provider callback',
    description:
      'Public callback hit by the OAuth2 provider (Google/Microsoft) after user consent. Validates the one-time state (PKCE session, default 15 minute expiry), exchanges the code for a refresh token, marks the application connected, consumes the session, and redirects to the management UI. Must stay public because OAuth providers do not send Cloudflare Access headers.',
    parameters: [
      {
        name: 'applicationId',
        in: 'path' as const,
        required: true,
        description: 'Unique identifier of the application the authorization session was created for',
        schema: {
          type: 'string' as const,
          format: 'uuid',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
      {
        name: 'code',
        in: 'query' as const,
        required: false,
        description: 'Authorization code issued by the OAuth2 provider (required on success)',
        schema: {
          type: 'string' as const,
          description: 'Provider authorization code',
          example: '4/0AVG7fiR6vXy-example-authorization-code',
        },
      },
      {
        name: 'state',
        in: 'query' as const,
        required: false,
        description: 'One-time state returned by POST /user/application/oauth2/authorize (required on success)',
        schema: {
          type: 'string' as const,
          description: 'Opaque one-time state value',
          example: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        },
      },
      {
        name: 'error',
        in: 'query' as const,
        required: false,
        description: 'OAuth2 error code when the user denied consent or the provider failed',
        schema: {
          type: 'string' as const,
          description: 'Provider error code',
          example: 'access_denied',
        },
      },
    ],
    responses: {
      '302': {
        description: 'Redirects to the user UI after callback processing',
        headers: {
          Location: {
            description: 'Management UI URL: /user?oauth2=connected&applicationId=... on success, /user?oauth2=error&message=... on provider error',
            schema: {
              type: 'string' as const,
              format: 'uri',
              example: '/user?oauth2=connected&applicationId=123e4567-e89b-12d3-a456-426614174000',
            },
          },
        },
      },
      '400': {
        description: 'Invalid callback - missing code/state or expired session',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: {
                      type: 'string' as const,
                      example: 'BadRequest',
                    },
                    Message: {
                      type: 'string' as const,
                      description: 'Details about the invalid callback',
                      example: 'OAuth2 authorization session is invalid or expired.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '500': {
        description: 'Internal server error during code exchange',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: {
                      type: 'string' as const,
                      example: 'InternalServerError',
                    },
                    Message: {
                      type: 'string' as const,
                      description: 'Error description',
                      example: 'The server encountered an internal error and was unable to complete your request.',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  protected async handleRequest(
    request: OAuth2CallbackRequest,
    env: OAuth2CallbackEnv,
    cxt: RouteContext<OAuth2CallbackEnv>,
  ): Promise<ExtendedResponse<OAuth2CallbackResponse>> {
    const applicationId: string | undefined = cxt.req.param('applicationId');
    if (!applicationId) {
      throw new BadRequestError('OAuth2 callback is missing applicationId.');
    }
    const url: URL = new URL(request.raw.url);
    const error: string | null = url.searchParams.get('error');
    if (error) {
      return this.redirect(`/user?oauth2=error&message=${encodeURIComponent(error)}`);
    }
    const code: string | null = url.searchParams.get('code');
    const state: string | null = url.searchParams.get('state');
    if (!code || !state) {
      throw new BadRequestError('OAuth2 callback is missing code or state.');
    }

    const scope = createRequestScope(env);
    await scope.get(Tokens.OAuth2AuthorizationService).completeCallback({
      applicationId,
      code,
      state,
    });
    return this.redirect(`/user?oauth2=connected&applicationId=${encodeURIComponent(applicationId)}`);
  }

  private redirect(location: string): ExtendedResponse<OAuth2CallbackResponse> {
    return {
      statusCode: 302,
      headers: { Location: location },
    };
  }
}

type OAuth2CallbackRequest = IRequest;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface OAuth2CallbackResponse extends IResponse {}

interface OAuth2CallbackEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { OAuth2CallbackRoute };
