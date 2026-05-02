import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_ACCESS_KEYS, PROVIDER_AMAZON_SNS } from '@mail-meow/shared/constants';
import { BadRequestError } from '@/error';
import { IPublicApplicationRoute } from '@/endpoints/IPublicApplicationRoute';
import type { IPublicApplicationEnv, IPublicApplicationRequest, IResponse, RouteContext } from '@/endpoints/IPublicApplicationRoute';
import type { AccessKeyCredentials } from '@mail-meow/shared/model';
import { SnsDeliveryUtil } from '@/utils';

class SendSNSRoute extends IPublicApplicationRoute<SendSNSRequest, SendSNSResponse, SendSNSEnv> {
  schema = {
    tags: ['Delivery'],
    summary: 'Publish SNS message',
    responses: {
      '200': {
        description: 'SNS message published',
      },
    },
  };

  protected async handleRequest(request: SendSNSRequest, _env: SendSNSEnv, _cxt: RouteContext<SendSNSEnv>): Promise<SendSNSResponse> {
    if (
      request.application.providerId !== PROVIDER_AMAZON_SNS ||
      request.application.connectionMethod !== CONNECTION_METHOD_ACCESS_KEYS ||
      request.application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED
    ) {
      throw new BadRequestError('The API key is not connected to an Amazon SNS access-key application.');
    }
    const credentials: AccessKeyCredentials = request.application.credentials as AccessKeyCredentials;
    const messageId: string = await SnsDeliveryUtil.publish(
      credentials.accessKeyId,
      credentials.secretAccessKey,
      credentials.topicArn,
      request.message,
      request.subject,
    );
    return {
      message: 'The message was published successfully.',
      messageId,
    };
  }
}

interface SendSNSRequest extends IPublicApplicationRequest {
  message: string;
  subject?: string;
}

interface SendSNSResponse extends IResponse {
  message: string;
  messageId: string;
}

type SendSNSEnv = IPublicApplicationEnv;

export { SendSNSRoute };
