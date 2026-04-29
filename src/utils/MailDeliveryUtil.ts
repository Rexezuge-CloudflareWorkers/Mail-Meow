import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@/constants';
import { BadRequestError, InternalServerError } from '@/error';

class MailDeliveryUtil {
  public static async sendEmail(
    providerId: string,
    from: string,
    to: string,
    subject: string,
    body: string,
    accessToken: string,
  ): Promise<void> {
    if (providerId === PROVIDER_GOOGLE_GMAIL) {
      await MailDeliveryUtil.sendGmail(from, to, subject, body, accessToken);
      return;
    }
    if (providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      await MailDeliveryUtil.sendMicrosoftOutlook(to, subject, body, accessToken);
      return;
    }
    throw new BadRequestError('The connected application does not support email delivery.');
  }

  private static async sendGmail(from: string, to: string, subject: string, body: string, accessToken: string): Promise<void> {
    const response: Response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: MailDeliveryUtil.createEmail(from, to, subject, body) }),
    });
    if (!response.ok) {
      throw new InternalServerError(`Gmail API error: ${await response.text()}`);
    }
  }

  private static async sendMicrosoftOutlook(to: string, subject: string, body: string, accessToken: string): Promise<void> {
    const response: Response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      }),
    });
    if (!response.ok) {
      throw new InternalServerError(`Microsoft Graph API error: ${await response.text()}`);
    }
  }

  private static createEmail(sender: string, recipient: string, subject: string, body: string): string {
    const email: string = [
      `From: ${sender}`,
      `To: ${recipient}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
    ].join('\r\n');
    return btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

export { MailDeliveryUtil };
