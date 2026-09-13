import { Tokens, createRequestScope } from '@mail-meow/backend-services/composition';


import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationApiKeyMetadata } from '@mail-meow/shared/model';


class CreateApplicationApiKeyRoute extends IUserRoute<
  CreateApplicationApiKeyRequest,
  CreateApplicationApiKeyResponse,
  CreateApplicationApiKeyEnv
> {
  schema = {
    tags: ['API Keys'],
    summary: 'Create application API key',
    description:
      'Creates an API key for a connected application owned by the authenticated user. The application must have status connected (OAuth2 authorization completed, or SNS access-key application). The plaintext apiKey is returned only once — store it securely, as later reads return metadata only.',
    requestBody: {
      description: 'API key to create',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['applicationId', 'name'],
            properties: {
              applicationId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the connected application',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
              name: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 128,
                description: 'Human-readable key name',
                example: 'CI pipeline',
              },
              expiresInDays: {
                type: 'number' as const,
                minimum: 1,
                description: 'Key lifetime in days; defaults to server default when omitted and cannot exceed the max',
                example: 90,
              },
            },
          },
          examples: {
            'default-expiry': {
              summary: 'Create key with default expiry',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                name: 'CI pipeline',
              },
            },
            'custom-expiry': {
              summary: 'Create key with custom expiry',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Order service',
                expiresInDays: 90,
              },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Application API key created',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              required: ['apiKey', 'metadata'],
              properties: {
                apiKey: {
                  type: 'string' as const,
                  description: 'Plaintext API key (mm_ prefix); shown only once, embed it in the /api/:api_key/... path',
                  example: 'mm_K7mP2xQ9vT4yR8wN3bV6cL1aS5dF0gH7jK9mN2pQ4',
                },
                metadata: {
                  type: 'object' as const,
                  required: ['apiKeyId', 'applicationId', 'name', 'keyPrefix', 'keyLastFour', 'createdAt', 'expiresAt'],
                  properties: {
                    apiKeyId: {
                      type: 'string' as const,
                      format: 'uuid',
                      description: 'Unique identifier of the API key',
                      example: '323e4567-e89b-12d3-a456-426614174002',
                    },
                    applicationId: {
                      type: 'string' as const,
                      format: 'uuid',
                      description: 'Application the key belongs to',
                      example: '123e4567-e89b-12d3-a456-426614174000',
                    },
                    name: {
                      type: 'string' as const,
                      description: 'Human-readable key name',
                      example: 'CI pipeline',
                    },
                    keyPrefix: {
                      type: 'string' as const,
                      description: 'First 10 characters of the plaintext key',
                      example: 'mm_K7mP2xQ',
                    },
                    keyLastFour: {
                      type: 'string' as const,
                      description: 'Last 4 characters of the plaintext key',
                      example: 'N2pQ',
                    },
                    createdAt: {
                      type: 'number' as const,
                      description: 'Unix timestamp in seconds when the key was created',
                      example: 1757548800,
                    },
                    expiresAt: {
                      type: 'number' as const,
                      description: 'Unix timestamp in seconds when the key expires',
                      example: 1789084800,
                    },
                  },
                },
              },
            },
            examples: {
              created: {
                summary: 'API key created (plaintext shown once)',
                value: {
                  apiKey: 'mm_K7mP2xQ9vT4yR8wN3bV6cL1aS5dF0gH7jK9mN2pQ4',
                  metadata: {
                    apiKeyId: '323e4567-e89b-12d3-a456-426614174002',
                    applicationId: '123e4567-e89b-12d3-a456-426614174000',
                    name: 'CI pipeline',
                    keyPrefix: 'mm_K7mP2xQ',
                    keyLastFour: 'N2pQ',
                    createdAt: 1757548800,
                    expiresAt: 1789084800,
                  },
                },
              },
            },
          },
        },
      },
      '400': {
        description: 'Invalid request - application not connected, key limit reached, or expiry too long',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: { type: 'string' as const, example: 'BadRequest' },
                    Message: {
                      type: 'string' as const,
                      description: 'Details about the invalid request',
                      example: 'Connected application must be connected before API keys can be created.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': {
        description: 'Unauthorized - Missing or invalid authentication',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: { type: 'string' as const, example: 'Unauthorized' },
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
        description: 'Internal server error while creating the API key',
        content: {
          'application/json': {
            schema: {
              type: 'object' as const,
              properties: {
                Exception: {
                  type: 'object' as const,
                  properties: {
                    Type: { type: 'string' as const, example: 'InternalServerError' },
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
    security: [{ CloudflareAccess: [] }],
  };

  protected async handleRequest(
    request: CreateApplicationApiKeyRequest,
    env: CreateApplicationApiKeyEnv,
    cxt: RouteContext<CreateApplicationApiKeyEnv>,
  ): Promise<CreateApplicationApiKeyResponse> {
    const scope = createRequestScope(env);
    const { metadata, apiKey } = await scope
      .get(Tokens.ApiKeyService)
      .createApiKey(request.applicationId, this.getAuthenticatedUserEmailAddress(cxt), request.name, request.expiresInDays);
    return {
      apiKey,
      metadata,
    };
  }
}

interface CreateApplicationApiKeyRequest extends IRequest {
  applicationId: string;
  name: string;
  expiresInDays?: number | undefined;
}

interface CreateApplicationApiKeyResponse extends IResponse {
  apiKey: string;
  metadata: ApplicationApiKeyMetadata;
}

interface CreateApplicationApiKeyEnv extends IUserEnv {
  MAX_API_KEYS_PER_APPLICATION?: string | undefined;
  DEFAULT_API_KEY_EXPIRY_DAYS?: string | undefined;
  MAX_API_KEY_EXPIRY_DAYS?: string | undefined;
}

export { CreateApplicationApiKeyRoute };
