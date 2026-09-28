import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';

import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';

class CreateOAuth2AuthorizationRoute extends IUserRoute<CreateOAuth2AuthorizationRequest, CreateOAuth2AuthorizationResponse> {
  schema = {
    tags: ['Applications'],
    summary: 'Create OAuth2 authorization URL',
    description:
      'Creates a short-lived OAuth2 authorization session (PKCE + one-time state) for an oauth2 application owned by the authenticated user and returns the provider authorization URL. Redirect the user to authorizationUrl; after consent the provider calls back to redirectUri (GET /api/oauth2/callback/:applicationId), which marks the application connected.',
    requestBody: {
      description: 'Application to authorize with the OAuth2 provider',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['applicationId'],
            properties: {
              applicationId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the oauth2 application to authorize',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
            },
          },
          examples: {
            'authorize-gmail': {
              summary: 'Authorize a Gmail application',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
              },
            },
          },
        },
      },
    },
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(
    request: CreateOAuth2AuthorizationRequest,
    env: Env,
    cxt: RouteContext,
  ): Promise<CreateOAuth2AuthorizationResponse> {
    const scope = createRequestScope(env);
    return scope.oauth2Authorization.createAuthorization(this.getAuthenticatedUserEmailAddress(cxt), request.applicationId, request.raw);
  }
}

interface CreateOAuth2AuthorizationRequest extends IRequest {
  applicationId: string;
}

interface CreateOAuth2AuthorizationResponse extends IResponse {
  authorizationUrl: string;
  redirectUri: string;
  expiresAt: number;
}

export { CreateOAuth2AuthorizationRoute };
