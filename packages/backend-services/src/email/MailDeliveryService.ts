import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_OAUTH2 } from '@mail-meow/shared/constants';
import { ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import { BadRequestError } from '@mail-meow/backend-errors';
import type { ConnectedApplication, OAuth2Credentials } from '@mail-meow/shared/model';
import { OAuth2ProviderUtil } from '@mail-meow/provider-clients/oauth2';
import { MailDeliveryUtil } from '@mail-meow/provider-clients';

interface MailDeliveryServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret | { get(): Promise<string> };
}

class MailDeliveryService {
  constructor(private readonly env: MailDeliveryServiceEnv) {}

  async sendEmailForApplication(
    application: ConnectedApplication,
    to: string,
    subject: string,
    body: { text?: string; html?: string },
  ): Promise<void> {
    if (
      application.connectionMethod !== CONNECTION_METHOD_OAUTH2 ||
      application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED
    ) {
      throw new BadRequestError('The API key is not connected to an authorized OAuth2 email application.');
    }
    const credentials: OAuth2Credentials = application.credentials as OAuth2Credentials;
    const tokenResult = await OAuth2ProviderUtil.refreshAccessToken({
      providerId: application.providerId,
      credentials,
    });
    if (tokenResult.refreshToken) {
      const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
      const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
      await applicationDAO.updateOAuth2RefreshToken(application.applicationId, tokenResult.refreshToken);
    }
    await MailDeliveryUtil.sendEmail(
      application.providerId,
      application.userEmail,
      to,
      subject,
      body,
      tokenResult.accessToken,
    );
  }
}

export { MailDeliveryService };
export type { MailDeliveryServiceEnv };
