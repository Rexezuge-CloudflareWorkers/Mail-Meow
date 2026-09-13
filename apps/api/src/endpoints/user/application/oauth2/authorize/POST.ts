import { Tokens, createRequestScope } from '@mail-meow/backend-services/composition';


import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';



class CreateOAuth2AuthorizationRoute extends IUserRoute<
  CreateOAuth2AuthorizationRequest,
  CreateOAuth2AuthorizationResponse,
  CreateOAuth2AuthorizationEnv
> {
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
    responses: {
      '200': {
        description: 'OAuth2 authorization URL created',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['authorizationUrl', 'redirectUri', 'expiresAt'],
              properties: {
                authorizationUrl: {
                  type: 'string' as const,
                  format: 'uri',
                  description: 'Provider authorization URL to redirect the user to (includes state and PKCE challenge)',
                  example:
                    'https://accounts.google.com/o/oauth2/v2/auth?client_id=1234567890-abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fmail.example.com%2Fapi%2Foauth2%2Fcallback%2F123e4567-e89b-12d3-a456-426614174000&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send&state=abc123&code_challenge=xyz&code_challenge_method=S256&access_type=offline&prompt=consent',
                },
                redirectUri: {
                  type: 'string' as const,
                  format: 'uri',
                  description: 'Registered OAuth2 callback URI for this application',
                  example: 'https://mail.example.com/api/oauth2/callback/123e4567-e89b-12d3-a456-426614174000',
                },
                expiresAt: {
                  type: 'number' as const,
                  description: 'Unix timestamp in seconds when the authorization session expires (default 15 minutes)',
                  example: 1_757_549_700,
                },
              },
            },
            examples: {
              'gmail-authorization': {
                summary: 'Gmail authorization session',
                value: {
                  authorizationUrl:
                    // eslint-disable-next-line sonarjs/no-hardcoded-secrets -- OpenAPI documentation example, not a real credential
                    'https://accounts.google.com/o/oauth2/v2/auth?client_id=1234567890-abc.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fmail.example.com%2Fapi%2Foauth2%2Fcallback%2F123e4567-e89b-12d3-a456-426614174000&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send&state=abc123&code_challenge=xyz&code_challenge_method=S256&access_type=offline&prompt=consent',
                  redirectUri: 'https://mail.example.com/api/oauth2/callback/123e4567-e89b-12d3-a456-426614174000',
                  expiresAt: 1_757_549_700,
                },
              },
              'outlook-authorization': {
                summary: 'Outlook authorization session',
                value: {
                  authorizationUrl:
                    // eslint-disable-next-line sonarjs/no-hardcoded-secrets -- OpenAPI documentation example, not a real credential
                    'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=00000000-1111-2222-3333-444444444444&redirect_uri=https%3A%2F%2Fmail.example.com%2Fapi%2Foauth2%2Fcallback%2F223e4567-e89b-12d3-a456-426614174001&response_type=code&scope=https%3A%2F%2Fgraph.microsoft.com%2FMail.Send%20offline_access&state=def456&code_challenge=uvw&code_challenge_method=S256&response_mode=query',
                  redirectUri: 'https://mail.example.com/api/oauth2/callback/223e4567-e89b-12d3-a456-426614174001',
                  expiresAt: 1_757_549_700,
                },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request - application not found or does not use OAuth2',
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
                      description: 'Details about the invalid request',
                      example: 'Connected application does not use OAuth2.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': {
        description: 'Unauthorized - Missing or invalid authentication headers',
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
                      example: 'Unauthorized',
                    },
                    Message: {
                      type: 'string' as const,
                      description: 'Authentication error details',
                      example: 'No Cloudflare Access JWT token provided in request headers.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '500': {
        description: 'Internal server error while creating the authorization session',
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
    security: [
      {
        CloudflareAccess: [],
      },
    ],
  };

  protected async handleRequest(
    request: CreateOAuth2AuthorizationRequest,
    env: CreateOAuth2AuthorizationEnv,
    cxt: RouteContext<CreateOAuth2AuthorizationEnv>,
  ): Promise<CreateOAuth2AuthorizationResponse> {
    const scope = createRequestScope(env);
    return scope.get(Tokens.OAuth2AuthorizationService).createAuthorization(
      this.getAuthenticatedUserEmailAddress(cxt),
      request.applicationId,
      request.raw,
    );
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

interface CreateOAuth2AuthorizationEnv extends IUserEnv {
  OAUTH2_STATE_EXPIRY_MINUTES?: string;
}

export { CreateOAuth2AuthorizationRoute };
