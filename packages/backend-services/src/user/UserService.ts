import { UserDAO } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import { ConfigurationManager } from '@mail-meow/backend-runtime/config';
import { LocaleUtil } from '@mail-meow/shared/utils';

interface UserServiceEnv {
  DB: D1Queryable;
  MAX_APPLICATIONS_PER_USER?: string;
}

interface UserServiceDeps {
  userDAO?: () => Promise<UserDAO>;
}

class UserService {
  private readonly deps: Required<UserServiceDeps>;

  constructor(
    private readonly env: UserServiceEnv,
    deps: UserServiceDeps = {},
  ) {
    const db: D1Queryable = env.DB;
    this.deps = {
      userDAO: () => Promise.resolve(new UserDAO(db)),
      ...deps,
    };
  }

  async upsertUser(email: string): Promise<void> {
    const userDAO = await this.deps.userDAO();
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
    const userDAO = await this.deps.userDAO();
    const user = await userDAO.getByEmail(userEmail);
    return user?.preferredLanguage ? LocaleUtil.normalize(user.preferredLanguage) : null;
  }

  async getCurrentUserSummary(
    userEmail: string,
  ): Promise<{ email: string; preferredLanguage: string | null; maxApplicationsPerUser: number }> {
    const userDAO = await this.deps.userDAO();
    const user = await userDAO.getByEmail(userEmail);
    return {
      email: userEmail,
      preferredLanguage: user?.preferredLanguage ? LocaleUtil.normalize(user.preferredLanguage) : null,
      maxApplicationsPerUser: ConfigurationManager.getMaxApplicationsPerUser(this.env),
    };
  }

  async updatePreferredLanguage(userEmail: string, preferredLanguage: string): Promise<string> {
    const normalized: string = LocaleUtil.normalize(preferredLanguage);
    const userDAO = await this.deps.userDAO();
    await userDAO.updatePreferredLanguage(userEmail, normalized);
    return normalized;
  }
}

export { UserService };
export type { UserServiceDeps, UserServiceEnv };
