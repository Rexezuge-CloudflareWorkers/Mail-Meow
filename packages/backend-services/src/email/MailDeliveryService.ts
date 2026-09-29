import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_OAUTH2 } from '@mail-meow/shared/constants';
import type { ConnectedApplicationDAO } from '@mail-meow/backend-data/dao';
import { BadRequestError } from '@mail-meow/backend-errors';
import type { AppConfigReader } from '@mail-meow/backend-runtime/config';
import type { ConnectedApplication, OAuth2Credentials } from '@mail-meow/shared/model';
import { resolveStrategy } from '@mail-meow/provider-clients';
import { OAuth2ProviderUtil } from '@mail-meow/provider-clients/oauth2';
import type { EmailBody } from '@mail-meow/provider-clients';

interface MailDeliveryServiceDeps {
  applicationDAO: () => Promise<ConnectedApplicationDAO>;
  config: () => AppConfigReader;
}

class MailDeliveryService {
  constructor(private readonly deps: MailDeliveryServiceDeps) {}

  /**
   * Sends a message on behalf of a connected application.
   *
   * A fresh token is obtained per send rather than read from cache: the
   * background refresh cron exists for the cron-driven paths, and a cached
   * token is exactly what would have gone stale between refreshes.
   */
  async sendEmailForApplication(application: ConnectedApplication, to: string, subject: string, body: EmailBody): Promise<void> {
    if (application.connectionMethod !== CONNECTION_METHOD_OAUTH2 || application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('The API key is not connected to an authorized OAuth2 email application.');
    }
    const timeoutMs: number = this.deps.config().providerRequestTimeoutMs;
    const tokenResult = await OAuth2ProviderUtil.refreshAccessToken({
      providerId: application.providerId,
      credentials: application.credentials as OAuth2Credentials,
      timeoutMs,
    });

    if (tokenResult.refreshToken) {
      // Providers may rotate the refresh token on every use. Persisting it is
      // what stops the next refresh from failing on a token the provider
      // already invalidated.
      const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
      await applicationDAO.updateOAuth2RefreshToken(application.applicationId, tokenResult.refreshToken);
    }

    await resolveStrategy(application.providerId).sendEmail(
      {
        from: application.userEmail,
        to,
        subject,
        body,
        accessToken: tokenResult.accessToken,
      },
      { timeoutMs },
    );
  }
}

export { MailDeliveryService };
export type { MailDeliveryServiceDeps };
