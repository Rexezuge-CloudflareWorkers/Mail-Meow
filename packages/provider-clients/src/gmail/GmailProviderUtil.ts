import { ProviderApiNonRetryableError } from '@mail-meow/backend-errors';
import { providerFetchJson } from '../BaseProviderHttp';

const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

interface GmailProfile {
  emailAddress: string;
}

class GmailProviderUtil {
  public static async getProfile(accessToken: string): Promise<GmailProfile> {
    // The transport returns whatever the provider sent, so the payload shape is
    // checked here. Callers dereference `emailAddress` without a further guard.
    const data: unknown = await providerFetchJson<unknown>(
      GMAIL_PROFILE_URL,
      { method: 'GET' },
      { providerName: 'Gmail', operation: 'get profile', accessToken },
    );
    const emailAddress: unknown = (data as { emailAddress?: unknown } | undefined)?.emailAddress;
    if (typeof emailAddress !== 'string' || !emailAddress) {
      throw new ProviderApiNonRetryableError('Gmail profile response did not include an email address.');
    }
    return { emailAddress };
  }
}

export { GmailProviderUtil };
export type { GmailProfile };
