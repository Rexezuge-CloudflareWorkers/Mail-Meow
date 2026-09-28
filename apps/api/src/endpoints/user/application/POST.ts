import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import { createRequestScope } from '@mail-meow/backend-services/composition';

import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata } from '@mail-meow/shared/model';

class CreateApplicationRoute extends IUserRoute<CreateApplicationRequest, CreateApplicationResponse> {
  schema = {
    tags: ['Applications'],
    summary: 'Create connected application',
    description:
      'Creates a connected application for the authenticated user. OAuth2 providers (google-gmail, microsoft-outlook) require clientId and clientSecret and start in draft status until the OAuth2 authorization flow completes. Access-key providers (amazon-sns) require accessKeyId, secretAccessKey, and topicArn and start as connected. Supported combinations are google-gmail/oauth2, microsoft-outlook/oauth2, and amazon-sns/access-keys.',
    requestBody: {
      description: 'Connected application to create',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['displayName', 'providerId', 'connectionMethod'],
            properties: {
              displayName: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 128,
                description: 'Human-readable application name',
                example: 'Gmail sender',
              },
              providerId: {
                type: 'string' as const,
                enum: ['google-gmail', 'microsoft-outlook', 'amazon-sns'],
                description: 'Delivery provider identifier',
                example: 'google-gmail',
              },
              connectionMethod: {
                type: 'string' as const,
                enum: ['oauth2', 'access-keys'],
                description: 'Credential mechanism; must match the provider (gmail/outlook use oauth2, sns uses access-keys)',
                example: 'oauth2',
              },
              clientId: {
                type: 'string' as const,
                maxLength: 512,
                description: 'OAuth2 client ID (required for oauth2 applications)',
                example: '1234567890-abc.apps.googleusercontent.com',
              },
              clientSecret: {
                type: 'string' as const,
                maxLength: 2048,
                description: 'OAuth2 client secret (required for oauth2 applications)',
                example: 'GOCSPX-AbCdEfGhIjKlMnOpQrStUv',
              },
              accessKeyId: {
                type: 'string' as const,
                maxLength: 128,
                description: 'AWS access key ID (required for access-keys applications)',
                example: 'AKIAIOSFODNN7EXAMPLE',
              },
              secretAccessKey: {
                type: 'string' as const,
                maxLength: 512,
                description: 'AWS secret access key (required for access-keys applications)',
                example: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
              },
              topicArn: {
                type: 'string' as const,
                pattern: String.raw`^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_.-]+$`,
                description: 'SNS topic ARN that published messages are sent to (required for access-keys applications)',
                example: 'arn:aws:sns:us-east-1:123456789012:order-notifications',
              },
            },
          },
          examples: {
            'gmail-oauth2': {
              summary: 'Gmail OAuth2 application (starts as draft)',
              value: {
                displayName: 'Gmail sender',
                providerId: 'google-gmail',
                connectionMethod: 'oauth2',
                clientId: '1234567890-abc.apps.googleusercontent.com',
                clientSecret: 'GOCSPX-AbCdEfGhIjKlMnOpQrStUv',
              },
            },
            'outlook-oauth2': {
              summary: 'Outlook OAuth2 application (starts as draft)',
              value: {
                displayName: 'Outlook sender',
                providerId: 'microsoft-outlook',
                connectionMethod: 'oauth2',
                clientId: '00000000-1111-2222-3333-444444444444',
                clientSecret: 'super-secret-client-secret',
              },
            },
            'sns-access-keys': {
              summary: 'Amazon SNS application (starts as connected)',
              value: {
                displayName: 'Order notifications',
                providerId: 'amazon-sns',
                connectionMethod: 'access-keys',
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                topicArn: 'arn:aws:sns:us-east-1:123456789012:order-notifications',
              },
            },
          },
        },
      },
    },
    responses: errorResponses(UNAUTHORIZED_ACCESS_MESSAGE),
    security: CLOUDFLARE_ACCESS_SECURITY,
  };

  protected async handleRequest(request: CreateApplicationRequest, env: Env, cxt: RouteContext): Promise<CreateApplicationResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const scope = createRequestScope(env);
    const application = await scope.applications.createApplication({
      userEmail,
      displayName: request.displayName,
      providerId: request.providerId,
      connectionMethod: request.connectionMethod,
      clientId: request.clientId,
      clientSecret: request.clientSecret,
      accessKeyId: request.accessKeyId,
      secretAccessKey: request.secretAccessKey,
      topicArn: request.topicArn,
      raw: request.raw,
    });
    return {
      application,
    };
  }
}

interface CreateApplicationRequest extends IRequest {
  displayName: string;
  providerId: string;
  connectionMethod: string;
  clientId?: string;
  clientSecret?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  topicArn?: string;
}

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface CreateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

export { CreateApplicationRoute };
