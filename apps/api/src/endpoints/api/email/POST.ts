import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_OAUTH2 } from '@mail-meow/shared/constants';
import { ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IPublicApplicationRoute } from '@/endpoints/IPublicApplicationRoute';
import type { IPublicApplicationEnv, IPublicApplicationRequest, IResponse, RouteContext } from '@/endpoints/IPublicApplicationRoute';
import type { OAuth2Credentials } from '@mail-meow/shared/model';
import { MailDeliveryUtil, OAuth2ProviderUtil } from '@/utils';

class SendEmailRoute extends IPublicApplicationRoute<SendEmailRequest, SendEmailResponse, SendEmailEnv> {
  schema = {
    tags: ['Delivery'],
    summary: 'Send email',
    responses: {
      '200': {
        description: 'Email sent',
      },
    },
  };

  protected async handleRequest(
    request: SendEmailRequest,
    env: SendEmailEnv,
    _cxt: RouteContext<SendEmailEnv>,
  ): Promise<SendEmailResponse> {
    if (
      request.application.connectionMethod !== CONNECTION_METHOD_OAUTH2 ||
      request.application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED
    ) {
      throw new BadRequestError('The API key is not connected to an authorized OAuth2 email application.');
    }
    const credentials: OAuth2Credentials = request.application.credentials as OAuth2Credentials;
    const tokenResult = await OAuth2ProviderUtil.refreshAccessToken({
      providerId: request.application.providerId,
      credentials,
    });
    if (tokenResult.refreshToken) {
      const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
      const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
      await applicationDAO.updateOAuth2RefreshToken(request.application.applicationId, tokenResult.refreshToken);
    }
    await MailDeliveryUtil.sendEmail(
      request.application.providerId,
      request.application.userEmail,
      request.to,
      request.subject,
      request.text,
      tokenResult.accessToken,
    );
    return { message: 'The email was sent successfully.' };
  }
}

interface SendEmailRequest extends IPublicApplicationRequest {
  to: string;
  subject: string;
  text: string;
}

interface SendEmailResponse extends IResponse {
  message: string;
}

type SendEmailEnv = IPublicApplicationEnv;

export { SendEmailRoute };
