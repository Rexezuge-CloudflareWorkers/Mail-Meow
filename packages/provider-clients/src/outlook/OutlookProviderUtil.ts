import { ProviderApiNonRetryableError } from '@mail-meow/backend-errors';
import { fetchJsonWithBearer } from '../BaseProviderHttp';

interface OutlookMailboxProfile {
  emailAddress: string;
}

class OutlookProviderUtil {
  public static async getProfile(accessToken: string): Promise<OutlookMailboxProfile> {
    const data = await fetchJsonWithBearer<{
      mail?: string | null;
      userPrincipalName?: string | null;
    }>('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', accessToken, 'Microsoft Graph');
    const emailAddress: string | undefined = data.mail || data.userPrincipalName || undefined;
    if (!emailAddress) throw new ProviderApiNonRetryableError('Microsoft Graph profile did not include a mailbox address.');
    return { emailAddress };
  }
}

export { OutlookProviderUtil };
export type { OutlookMailboxProfile };
