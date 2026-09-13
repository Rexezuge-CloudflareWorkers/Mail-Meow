import { fetchJsonWithBearer } from '../BaseProviderHttp';

interface GmailProfile {
  emailAddress: string;
}

class GmailProviderUtil {
  public static async getProfile(accessToken: string): Promise<GmailProfile> {
    return fetchJsonWithBearer<GmailProfile>('https://gmail.googleapis.com/gmail/v1/users/me/profile', accessToken, 'Gmail');
  }
}

export { GmailProviderUtil };
export type { GmailProfile };
