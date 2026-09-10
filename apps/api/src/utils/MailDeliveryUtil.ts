import { convert } from 'html-to-text';
import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-meow/shared/constants';
import { BadRequestError, InternalServerError } from '@/error';

interface EmailBody {
  text?: string;
  html?: string;
}

class MailDeliveryUtil {
  public static async sendEmail(
    providerId: string,
    from: string,
    to: string,
    subject: string,
    body: EmailBody,
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

  private static async sendGmail(
    from: string,
    to: string,
    subject: string,
    body: EmailBody,
    accessToken: string,
  ): Promise<void> {
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
    const message = (await response.json()) as { id: string };
    await MailDeliveryUtil.trashGmailMessage(message.id, accessToken);
  }

  private static async trashGmailMessage(messageId: string, accessToken: string): Promise<void> {
    const response: Response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      console.error(`Failed to trash Gmail message ${messageId}: ${await response.text()}`);
    }
  }

  private static async sendMicrosoftOutlook(
    to: string,
    subject: string,
    body: EmailBody,
    accessToken: string,
  ): Promise<void> {
    const messageBody = body.html
      ? { contentType: 'HTML', content: body.html }
      : { contentType: 'Text', content: body.text ?? '' };
    const response: Response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: messageBody,
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
    });
    if (!response.ok) {
      throw new InternalServerError(`Microsoft Graph API error: ${await response.text()}`);
    }
  }

  private static createEmail(sender: string, recipient: string, subject: string, body: EmailBody): string {
    if (!body.html) {
      const email: string = [
        `From: ${sender}`,
        `To: ${recipient}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        body.text ?? '',
      ].join('\r\n');
      return MailDeliveryUtil.base64UrlEncodeString(email);
    }
    const textBody: string = body.text ?? MailDeliveryUtil.stripHtml(body.html);
    const boundary: string = MailDeliveryUtil.createMimeBoundary();
    const email: string = [
      `From: ${sender}`,
      `To: ${recipient}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      MailDeliveryUtil.buildAlternativeMimeBody(textBody, body.html, boundary),
    ].join('\r\n');
    return MailDeliveryUtil.base64UrlEncodeString(email);
  }

  private static createMimeBoundary(): string {
    return `mail-meow-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private static toCrlf(value: string): string {
    return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '\r\n');
  }

  private static buildAlternativeMimeBody(textBody: string, htmlBody: string, boundary: string): string {
    return [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      MailDeliveryUtil.toCrlf(textBody),
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      MailDeliveryUtil.toCrlf(htmlBody),
      `--${boundary}--`,
      '',
    ].join('\r\n');
  }

  private static stripHtml(value: string): string {
    return convert(value, {
      wordwrap: false,
      selectors: [
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'br', format: 'lineBreak' },
        { selector: 'p', options: { leadingLineBreaks: 0, trailingLineBreaks: 1 } },
      ],
    });
  }

  private static base64UrlEncodeString(value: string): string {
    const bytes: Uint8Array = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte: number): void => {
      binary += String.fromCodePoint(byte);
    });
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  }
}

export { MailDeliveryUtil };
export type { EmailBody };
