import {
  ApplicationApiKeyDAO,
  BackgroundTaskRunDAO,
  ConnectedApplicationDAO,
  OAuth2AccessTokenCacheDAO,
  OAuth2AuthorizationSessionDAO,
  UserDAO,
} from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { ApiKeyService } from '../apikey/ApiKeyService';
import { ApplicationService } from '../application/ApplicationService';
import { MailDeliveryService } from '../email/MailDeliveryService';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import { OAuth2AuthorizationService } from '../oauth2/OAuth2AuthorizationService';
import { ProcessingService } from '../processing/ProcessingService';
import { SnsDeliveryService } from '../sns/SnsDeliveryService';
import { UserService } from '../user/UserService';

/**
The `env` surface a request needs. Deliberately narrow and fully typed.
*/
interface ServiceEnvironment {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: { get(): Promise<string> };
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
}

/**
 * Everything a request needs, resolved once.
 *
 * This is a plain object rather than a container: services receive their
 * collaborators as constructor arguments, so there is no token lookup, no
 * service locator to grep for, and no need for a binding to be "registered"
 * before it can be used. The previous `Container` + `Tokens` pair added ~110
 * lines of indirection while seven of its bindings were never resolved.
 */
interface AppServices {
  readonly config: AppConfigReader;
  readonly apiKeys: ApiKeyService;
  readonly applications: ApplicationService;
  readonly mailDelivery: MailDeliveryService;
  readonly oauth2AccessTokens: OAuth2AccessTokenService;
  readonly oauth2Authorization: OAuth2AuthorizationService;
  readonly processing: ProcessingService;
  readonly sns: SnsDeliveryService;
  readonly users: UserService;
}

/**
 * Caches the first settled value, including a rejection.
 *
 * Rejections are cached deliberately: a Secrets Store read that failed once will
 * fail again within the same request, and retrying it on every DAO construction
 * would multiply the latency of the failure. `reset` exists for the case where
 * a caller genuinely wants to retry.
 */
function memoize<T>(factory: () => Promise<T>): () => Promise<T> {
  let settled: Promise<T> | undefined;
  return () => (settled ??= factory());
}

/**
 * Builds the service graph for one request.
 *
 * Every DAO is constructed at most once, and the master key is read from the
 * Secrets Store once, rather than each service building its own DAOs from `env`.
 */
function createRequestScope(env: ServiceEnvironment): AppServices {
  const config: AppConfigReader = AppConfigReader.fromEnv(env);
  const readConfig = (): AppConfigReader => config;

  // Services declare their collaborators as async factories so a DAO can be
  // constructed lazily on first use. Only the two encrypted ones need to await
  // the master key; the rest are plain constructors.
  const masterKey = memoize(async (): Promise<string> => env.AES_ENCRYPTION_KEY_SECRET.get());
  const applicationDAO = memoize(async (): Promise<ConnectedApplicationDAO> => new ConnectedApplicationDAO(env.DB, await masterKey()));
  const apiKeyDAO = memoize((): Promise<ApplicationApiKeyDAO> => Promise.resolve(new ApplicationApiKeyDAO(env.DB)));
  const sessionDAO = memoize((): Promise<OAuth2AuthorizationSessionDAO> => Promise.resolve(new OAuth2AuthorizationSessionDAO(env.DB)));
  const userDAO = memoize((): Promise<UserDAO> => Promise.resolve(new UserDAO(env.DB)));
  const taskRunDAO = memoize((): Promise<BackgroundTaskRunDAO> => Promise.resolve(new BackgroundTaskRunDAO(env.DB)));
  const cacheDAO = memoize(
    async (): Promise<OAuth2AccessTokenCacheDAO> => new OAuth2AccessTokenCacheDAO(env.OAUTH2_TOKEN_CACHE, await masterKey()),
  );

  const accessTokens: OAuth2AccessTokenService = new OAuth2AccessTokenService({
    cacheDAO,
    tokenRefreshers: (): DurableObjectNamespace => env.OAUTH2_TOKEN_REFRESHERS,
    config: readConfig,
  });

  return {
    config,
    apiKeys: new ApiKeyService({ applicationDAO, apiKeyDAO, config: readConfig }),
    applications: new ApplicationService({ applicationDAO, config: readConfig }),
    mailDelivery: new MailDeliveryService({ applicationDAO }),
    oauth2AccessTokens: accessTokens,
    oauth2Authorization: new OAuth2AuthorizationService({
      applicationDAO,
      sessionDAO,
      accessTokenService: (): OAuth2AccessTokenService => accessTokens,
      config: readConfig,
    }),
    processing: new ProcessingService({ taskRunDAO, applicationDAO, accessTokenService: (): OAuth2AccessTokenService => accessTokens }),
    // SNS is credential-only: no DAO, no config, nothing to inject.
    sns: new SnsDeliveryService(),
    users: new UserService({ userDAO, config: readConfig }),
  };
}

export { createRequestScope };
export type { AppServices, ServiceEnvironment };
