import { BaseUrlUtil } from '@mail-meow/shared/utils';
import type { ConnectedApplicationMetadata } from '@mail-meow/shared/model';

class ApplicationResponseUtil {
  public static withRedirectUri<T extends ConnectedApplicationMetadata>(application: T, raw: Request): T & { oauth2RedirectUri: string } {
    return {
      ...application,
      oauth2RedirectUri: `${BaseUrlUtil.getBaseUrl(raw)}/api/oauth2/callback/${application.applicationId}`,
    };
  }
}

export { ApplicationResponseUtil };
