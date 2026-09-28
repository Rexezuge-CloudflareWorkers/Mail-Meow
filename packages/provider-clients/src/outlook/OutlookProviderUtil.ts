import { ProviderApiNonRetryableError } from '@mail-meow/backend-errors';
import { providerFetchJson } from '../BaseProviderHttp';

const GRAPH_PROFILE_URL = 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName';

interface OutlookMailboxProfile {
  emailAddress: string;
}

class OutlookProviderUtil {
  public static async getProfile(accessToken: string): Promise<OutlookMailboxProfile> {
    const data: unknown = await providerFetchJson<unknown>(
      GRAPH_PROFILE_URL,
      { method: 'GET' },
      { providerName: 'Microsoft Graph', operation: 'get profile', accessToken },
    );
    const { mail, userPrincipalName } = (data ?? {}) as { mail?: unknown; userPrincipalName?: unknown };
    // Graph leaves `mail` null for accounts without a mailbox; the UPN is the fallback.
    const emailAddress: string | undefined =
      typeof mail === 'string' && mail ? mail : typeof userPrincipalName === 'string' && userPrincipalName ? userPrincipalName : undefined;
    if (!emailAddress) {
      throw new ProviderApiNonRetryableError('Microsoft Graph profile did not include a mailbox address.');
    }
    return { emailAddress };
  }
}

export { OutlookProviderUtil };
export type { OutlookMailboxProfile };
