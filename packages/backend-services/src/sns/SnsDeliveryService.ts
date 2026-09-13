import { SnsDeliveryUtil } from '@mail-meow/provider-clients';
import type { ConnectedApplication, AccessKeyCredentials } from '@mail-meow/shared/model';
import { BadRequestError } from '@mail-meow/backend-errors';
import { CONNECTION_METHOD_ACCESS_KEYS, CONNECTED_APPLICATION_STATUS_CONNECTED, PROVIDER_AMAZON_SNS } from '@mail-meow/shared/constants';

class SnsDeliveryService {
  async publishForApplication(application: ConnectedApplication, message: string, subject?: string): Promise<string> {
    if (
      application.providerId !== PROVIDER_AMAZON_SNS ||
      application.connectionMethod !== CONNECTION_METHOD_ACCESS_KEYS ||
      application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED
    ) {
      throw new BadRequestError('The API key is not connected to an Amazon SNS access-key application.');
    }
    const credentials = application.credentials as AccessKeyCredentials;
    return SnsDeliveryUtil.publish(credentials.accessKeyId, credentials.secretAccessKey, credentials.topicArn, message, subject);
  }
}

export { SnsDeliveryService };
