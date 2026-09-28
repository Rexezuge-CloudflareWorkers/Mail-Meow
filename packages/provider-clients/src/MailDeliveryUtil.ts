import { convert } from 'html-to-text';
import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-meow/shared/constants';
import { BadRequestError, ProviderApiNonRetryableError } from '@mail-meow/backend-errors';
import { providerFetchJson, providerFetchOk } from './BaseProviderHttp';
import { EmailMimeBuilder } from './EmailMimeBuilder';
import type { EmailBody } from './EmailMimeBuilder';

const GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_MESSAGES_BY_ID_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const GRAPH_SEND_MAIL_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

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
      await this.sendGmail(from, to, subject, body, accessToken);
      return;
    }
    if (providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      await this.sendMicrosoftOutlook(to, subject, body, accessToken);
      return;
    }
    throw new BadRequestError('The connected application does not support email delivery.');
  }

  private static async sendGmail(from: string, to: string, subject: string, body: EmailBody, accessToken: string): Promise<void> {
    // Gmail requires the whole RFC 5322 message as base64url in `raw`.
    const message: { id: string } | undefined = await providerFetchJson<{ id: string }>(
      GMAIL_MESSAGES_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: this.createEmail(from, to, subject, body) }),
      },
      { providerName: 'Gmail', operation: 'send message', accessToken },
    );
    if (!message?.id) {
      throw new ProviderApiNonRetryableError('Gmail API did not return a message id for the sent message.');
    }
    await this.trashGmailMessage(message.id, accessToken);
  }

  private static async trashGmailMessage(messageId: string, accessToken: string): Promise<void> {
    try {
      // The message was already accepted by Gmail, so a failure here is
      // best-effort cleanup: logged, not thrown, but not swallowed silently.
      await providerFetchOk(
        // messageId is provider-controlled, so encode it before it becomes a path segment.
        `${GMAIL_MESSAGES_BY_ID_URL}/${encodeURIComponent(messageId)}/trash`,
        { method: 'POST' },
        { providerName: 'Gmail', operation: 'trash message', accessToken },
      );
    } catch (error: unknown) {
      console.error(`Failed to trash Gmail message ${messageId}:`, error);
    }
  }

  private static async sendMicrosoftOutlook(to: string, subject: string, body: EmailBody, accessToken: string): Promise<void> {
    // Graph sendMail takes structured JSON and scopes the sender to the mailbox
    // behind the access token, so there is no `from` to pass through.
    const messageBody = body.html ? { contentType: 'HTML', content: body.html } : { contentType: 'Text', content: body.text ?? '' };
    await providerFetchOk(
      GRAPH_SEND_MAIL_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: messageBody,
            toRecipients: [{ emailAddress: { address: to } }],
          },
          saveToSentItems: false,
        }),
      },
      { providerName: 'Microsoft Graph', operation: 'send message', accessToken },
    );
  }

  private static createEmail(sender: string, recipient: string, subject: string, body: EmailBody): string {
    if (!body.html) {
      return this.base64UrlEncodeString(EmailMimeBuilder.buildTextEmail(sender, recipient, subject, body.text ?? ''));
    }
    const textBody: string = body.text ?? this.stripHtml(body.html);
    return this.base64UrlEncodeString(EmailMimeBuilder.buildAlternativeEmail(sender, recipient, subject, textBody, body.html));
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
    // Accumulated in a loop rather than via spread: a large body would exceed
    // the engine's argument-count ceiling on String.fromCodePoint(...bytes).
    for (const byte of bytes) {
      binary += String.fromCodePoint(byte);
    }
    return btoa(binary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/={0,2}$/, '');
  }
}

export { MailDeliveryUtil };

export { type EmailBody } from './EmailMimeBuilder';
