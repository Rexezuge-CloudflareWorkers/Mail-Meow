import type { UserDAO } from '@mail-meow/backend-data/dao';
import type { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { LocaleUtil } from '@mail-meow/shared/utils';

interface UserServiceDeps {
  userDAO: () => Promise<UserDAO>;
  config: () => AppConfigReader;
}

class UserService {
  constructor(private readonly deps: UserServiceDeps) {}

  async upsertUser(email: string): Promise<void> {
    const userDAO: UserDAO = await this.deps.userDAO();
    await userDAO.upsertByEmail(email);
  }

  /**
   * Returns the stored language, or `null` when none is set.
   *
   * A D1 failure propagates. This previously caught everything and returned
   * `null`, which made a database outage indistinguishable from "no language
   * chosen" — every `GET /user/me` silently reported a default.
   */
  async getPreferredLanguage(userEmail: string): Promise<string | null> {
    const userDAO: UserDAO = await this.deps.userDAO();
    const user = await userDAO.getByEmail(userEmail);
    return user?.preferredLanguage ? LocaleUtil.normalize(user.preferredLanguage) : null;
  }

  async getCurrentUserSummary(
    userEmail: string,
  ): Promise<{ email: string; preferredLanguage: string | null; maxApplicationsPerUser: number }> {
    const userDAO: UserDAO = await this.deps.userDAO();
    const user = await userDAO.getByEmail(userEmail);
    return {
      email: userEmail,
      preferredLanguage: user?.preferredLanguage ? LocaleUtil.normalize(user.preferredLanguage) : null,
      maxApplicationsPerUser: this.deps.config().maxApplicationsPerUser,
    };
  }

  async updatePreferredLanguage(userEmail: string, preferredLanguage: string): Promise<string> {
    const normalized: string = LocaleUtil.normalize(preferredLanguage);
    const userDAO: UserDAO = await this.deps.userDAO();
    await userDAO.updatePreferredLanguage(userEmail, normalized);
    return normalized;
  }
}

export { UserService };
export type { UserServiceDeps };
