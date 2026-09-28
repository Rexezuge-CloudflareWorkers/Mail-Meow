import { CLOUDFLARE_ACCESS_SECURITY, UNAUTHORIZED_ACCESS_MESSAGE, errorResponses } from '@/openapi/components';
import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  type ConnectedApplicationStatus,
  CONNECTION_METHOD_ACCESS_KEYS,
} from '@mail-meow/shared/constants';
import { createRequestScope } from '@mail-meow/backend-services/composition';

import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationCredentials, ConnectedApplicationMetadata } from '@mail-meow/shared/model';

class UpdateApplicationRoute extends IUserRoute<UpdateApplicationRequest, UpdateApplicationResponse> {
  schema = {
    tags: ['Applications'],
    summary: 'Update connected application',
    description:
      'Updates displayName and credentials for an application owned by the authenticated user. providerId and connectionMethod cannot be changed after creation. OAuth2 applications return to draft status after credential rotation until re-authorized; access-key applications stay connected.',
    requestBody: {
      description: 'Connected application fields to update',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object' as const,
            required: ['applicationId', 'displayName', 'providerId', 'connectionMethod'],
            properties: {
              applicationId: {
                type: 'string' as const,
                format: 'uuid',
                description: 'Unique identifier of the application to update',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
              displayName: {
                type: 'string' as const,
                minLength: 1,
                maxLength: 128,
                description: 'Human-readable application name',
                example: 'Gmail sender (updated)',
              },
              providerId: {
                type: 'string' as const,
                enum: ['google-gmail', 'microsoft-outlook', 'amazon-sns'],
                description: 'Delivery provider identifier; must match the existing application',
                example: 'google-gmail',
              },
              connectionMethod: {
                type: 'string' as const,
                enum: ['oauth2', 'access-keys'],
                description: 'Credential mechanism; must match the existing application',
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
                example: 'GOCSPX-NewSecretValue',
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
                description: 'SNS topic ARN (required for access-keys applications)',
                example: 'arn:aws:sns:us-east-1:123456789012:order-notifications',
              },
            },
          },
          examples: {
            'update-oauth2': {
              summary: 'Rotate OAuth2 credentials',
              value: {
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                displayName: 'Gmail sender (updated)',
                providerId: 'google-gmail',
                connectionMethod: 'oauth2',
                clientId: '1234567890-abc.apps.googleusercontent.com',
                clientSecret: 'GOCSPX-NewSecretValue',
              },
            },
            'update-sns': {
              summary: 'Rotate SNS access keys',
              value: {
                applicationId: '223e4567-e89b-12d3-a456-426614174001',
                displayName: 'Order notifications (updated)',
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

  protected async handleRequest(request: UpdateApplicationRequest, env: Env, cxt: RouteContext): Promise<UpdateApplicationResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const scope = createRequestScope(env);
    const credentials: ConnectedApplicationCredentials =
      request.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS
        ? {
            accessKeyId: request.accessKeyId!,
            secretAccessKey: request.secretAccessKey!,
            topicArn: request.topicArn!,
          }
        : {
            clientId: request.clientId!,
            clientSecret: request.clientSecret!,
          };
    const status: ConnectedApplicationStatus =
      request.connectionMethod === CONNECTION_METHOD_ACCESS_KEYS
        ? CONNECTED_APPLICATION_STATUS_CONNECTED
        : CONNECTED_APPLICATION_STATUS_DRAFT;
    const application = await scope.applications.updateApplication(
      request.applicationId,
      userEmail,
      request.displayName,
      request.providerId,
      request.connectionMethod,
      credentials,
      status,
      request.raw,
    );
    return {
      application,
    };
  }
}

interface UpdateApplicationRequest extends IRequest {
  applicationId: string;
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

interface UpdateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

export { UpdateApplicationRoute };
