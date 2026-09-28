import type { UserDAO, UserEmailDAO } from '@mail-meow/backend-data/dao';
import type { AppConfigReader } from '@mail-meow/backend-runtime/config';
import type { AccountIdentity } from '@mail-meow/shared/model';
import { LocaleUtil } from '@mail-meow/shared/utils';
import { registerAccount, resolveAccount } from './accountLookup';

interface UserServiceDeps {
  userDAO: () => Promise<UserDAO>;
  userEmailDAO: () => Promise<UserEmailDAO>;
  config: () => AppConfigReader;
}

/**
 * What `GET /user/me` reports about the caller.
 */
interface CurrentUserSummary {
  id: string;
  /**
  The current sign-in address, not the frozen anchor.
  */
  email: string;
  preferredLanguage: string | null;
  maxApplicationsPerUser: number;
}

class UserService {
  constructor(private readonly deps: UserServiceDeps) {}

  /**
   * Resolve the caller's address to an account, creating one if the address is
   * new.
   *
   * Resolve-then-create, so an address that already identifies an account can
   * never fork a second one. This runs on every authenticated request, so it is
   * the single place an account comes into existence.
   */
  async upsertUser(email: string): Promise<AccountIdentity | null> {
    return registerAccount({ userDAO: this.deps.userDAO, userEmailDAO: this.deps.userEmailDAO }, email);
  }

  /**
   * The account behind an address, without creating one.
   */
  async resolveAccount(email: string): Promise<AccountIdentity | null> {
    return resolveAccount({ userDAO: this.deps.userDAO, userEmailDAO: this.deps.userEmailDAO }, email);
  }

  /**
   * Returns the stored language, or `null` when none is set.
   *
   * A D1 failure propagates. This previously caught everything and returned
   * `null`, which made a database outage indistinguishable from "no language
   * chosen" — every `GET /user/me` silently reported a default.
   *
   * Keyed on the account id, so a chosen language survives an address change.
   */
  async getPreferredLanguage(user: AccountIdentity): Promise<string | null> {
    const userDAO: UserDAO = await this.deps.userDAO();
    const row = user.id ? await userDAO.getById(user.id) : await userDAO.getByEmail(user.anchorEmail);
    return row?.preferred_language ? LocaleUtil.normalize(row.preferred_language) : null;
  }

  async getCurrentUserSummary(user: AccountIdentity): Promise<CurrentUserSummary> {
    return {
      id: user.id,
      email: user.email,
      preferredLanguage: await this.getPreferredLanguage(user),
      maxApplicationsPerUser: this.deps.config().maxApplicationsPerUser,
    };
  }

  async updatePreferredLanguage(user: AccountIdentity, preferredLanguage: string): Promise<string> {
    const normalized: string = LocaleUtil.normalize(preferredLanguage);
    const userDAO: UserDAO = await this.deps.userDAO();
    await userDAO.updatePreferredLanguage(user, normalized);
    return normalized;
  }
}

export { UserService };
export type { CurrentUserSummary, UserServiceDeps };
