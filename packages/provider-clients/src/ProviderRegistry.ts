import { BadRequestError, ProviderApiNonRetryableError } from '@mail-meow/backend-errors';
import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-meow/shared/constants';
import { ErrorSanitizationUtil } from '@mail-meow/shared/utils';
import { providerFetchJson, providerFetchOk } from './BaseProviderHttp';
import type { ProviderRequest } from './BaseProviderHttp';
import { EmailMimeBuilder } from './EmailMimeBuilder';
import type { EmailBody } from './EmailMimeBuilder';

interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  body: EmailBody;
  accessToken: string;
}

/**
 * Per-provider behaviour, behind one interface.
 *
 * Adding a provider means adding one entry to `PROVIDER_STRATEGIES`, not
 * extending an `if (providerId === ...)` ladder at each call site. This
 * replaces three such ladders (mail delivery, OAuth2 config, profile lookup)
 * with one dispatch point.
 */
interface ProviderStrategy {
  /**
  Display name used in log and error messages.
  */
  readonly label: string;
  sendEmail(input: SendEmailInput, request?: Partial<ProviderRequest>): Promise<void>;
  /**
   * Resolves the mailbox address behind an access token.
   *
   * `from` is absent here: Outlook's `sendEmail` ignores it because Graph scopes
   * the sender to the mailbox owning the token.
   */
  resolveProfileEmail(accessToken: string, request?: Partial<ProviderRequest>): Promise<string>;
}

const GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_MESSAGES_BY_ID_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
const GRAPH_PROFILE_URL = 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName';
const GRAPH_SEND_MAIL_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

/**
 * `messages.send` leaves a copy in Drafts. Removing it immediately is what makes
 * an API send indistinguishable from a manual send, and it is why the send path
 * needs the returned message id.
 */
async function trashGmailDraft(messageId: string, accessToken: string, request?: Partial<ProviderRequest>): Promise<void> {
  try {
    await providerFetchOk(
      // messageId is provider-controlled, so encode it before it becomes a path segment.
      `${GMAIL_MESSAGES_BY_ID_URL}/${encodeURIComponent(messageId)}/trash`,
      { method: 'POST' },
      { ...request, providerName: 'Gmail', operation: 'trash message', accessToken },
    );
  } catch (error: unknown) {
    // The message was already accepted, so this is best-effort cleanup:
    // logged rather than thrown, but not swallowed silently.
    console.error(`Failed to trash Gmail message ${messageId}:`, ErrorSanitizationUtil.sanitizeErrorForLogging(error));
  }
}

const gmailStrategy: ProviderStrategy = {
  label: 'Gmail',
  async sendEmail(input: SendEmailInput, request?: Partial<ProviderRequest>): Promise<void> {
    const message: { id: string } | undefined = await providerFetchJson<{ id: string }>(
      GMAIL_MESSAGES_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: EmailMimeBuilder.buildRawMessage(input.from, input.to, input.subject, input.body) }),
      },
      { ...request, providerName: 'Gmail', operation: 'send message', accessToken: input.accessToken },
    );
    if (!message?.id) {
      throw new ProviderApiNonRetryableError('Gmail did not return a message id for the sent message.');
    }
    await trashGmailDraft(message.id, input.accessToken, request);
  },

  async resolveProfileEmail(accessToken: string, request?: Partial<ProviderRequest>): Promise<string> {
    // Validated rather than cast: callers dereference this without a guard.
    const data: unknown = await providerFetchJson<unknown>(
      GMAIL_PROFILE_URL,
      { method: 'GET' },
      { ...request, providerName: 'Gmail', operation: 'get profile', accessToken },
    );
    const emailAddress: unknown = (data as { emailAddress?: unknown } | undefined)?.emailAddress;
    if (typeof emailAddress !== 'string' || !emailAddress) {
      throw new ProviderApiNonRetryableError('Gmail profile response did not include an email address.');
    }
    return emailAddress;
  },
};

const outlookStrategy: ProviderStrategy = {
  label: 'Microsoft Graph',

  async sendEmail(input: SendEmailInput, request?: Partial<ProviderRequest>): Promise<void> {
    // Graph takes structured JSON rather than raw MIME, and scopes the sender to
    // the mailbox behind the access token, so there is no `from` to pass.
    const messageBody = input.body.html
      ? { contentType: 'HTML', content: input.body.html }
      : { contentType: 'Text', content: input.body.text ?? '' };
    await providerFetchOk(
      GRAPH_SEND_MAIL_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: messageBody,
            toRecipients: [{ emailAddress: { address: input.to } }],
          },
          saveToSentItems: false,
        }),
      },
      { ...request, providerName: 'Microsoft Graph', operation: 'send message', accessToken: input.accessToken },
    );
  },

  async resolveProfileEmail(accessToken: string, request?: Partial<ProviderRequest>): Promise<string> {
    const data: unknown = await providerFetchJson<unknown>(
      GRAPH_PROFILE_URL,
      { method: 'GET' },
      { ...request, providerName: 'Microsoft Graph', operation: 'get profile', accessToken },
    );
    const { mail, userPrincipalName } = (data ?? {}) as { mail?: unknown; userPrincipalName?: unknown };
    // Graph leaves `mail` null for accounts without a mailbox; the UPN is the fallback.
    const emailAddress: string | undefined =
      typeof mail === 'string' && mail ? mail : typeof userPrincipalName === 'string' && userPrincipalName ? userPrincipalName : undefined;
    if (!emailAddress) {
      throw new ProviderApiNonRetryableError('Microsoft Graph profile did not include a mailbox address.');
    }
    return emailAddress;
  },
};

/**
The registry. Adding a provider is one map entry.
*/
const PROVIDER_STRATEGIES: ReadonlyMap<string, ProviderStrategy> = new Map([
  [PROVIDER_GOOGLE_GMAIL, gmailStrategy],
  [PROVIDER_MICROSOFT_OUTLOOK, outlookStrategy],
]);

function resolveStrategy(providerId: string): ProviderStrategy {
  const strategy: ProviderStrategy | undefined = PROVIDER_STRATEGIES.get(providerId);
  if (!strategy) {
    throw new BadRequestError('The connected application does not support email delivery.');
  }
  return strategy;
}

export { PROVIDER_STRATEGIES, resolveStrategy };
export type { ProviderStrategy, SendEmailInput };
