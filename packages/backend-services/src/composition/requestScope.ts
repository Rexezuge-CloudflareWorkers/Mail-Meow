import {
  ApplicationApiKeyDAO,
  BackgroundTaskRunDAO,
  ConnectedApplicationDAO,
  OAuth2AccessTokenCacheDAO,
  OAuth2AuthorizationSessionDAO,
  UserDAO,
  UserEmailDAO,
} from '@mail-meow/backend-data/dao';
import { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { Container } from '@rexezuge/runtime';
import { UserIdentityService } from '../identity';
import { ApiKeyService } from '../apikey/ApiKeyService';
import { ApplicationService } from '../application/ApplicationService';
import { MailDeliveryService } from '../email/MailDeliveryService';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import { OAuth2AuthorizationService } from '../oauth2/OAuth2AuthorizationService';
import { ProcessingService } from '../processing/ProcessingService';
import { SnsDeliveryService } from '../sns/SnsDeliveryService';
import { UserService } from '../user/UserService';
import { Tokens } from './tokens';
import type { RequestScopeEnv } from './tokens';

/**
 * Caches the first settled value, including a rejection.
 *
 * Rejections are cached deliberately: a Secrets Store read that failed once will
 * fail again within the same request, and retrying it on every DAO construction
 * would multiply the latency of the failure.
 */
function memoize<T>(factory: () => Promise<T>): () => Promise<T> {
  let settled: Promise<T> | undefined;
  return () => (settled ??= factory());
}

/**
 * Builds the service graph for one request.
 *
 * A `Container` rather than a plain object. The previous shape was a plain
 * object with ten eager properties, which made "what does a route have?" a
 * question about a type rather than about a lookup — and it forced the master
 * key to be resolved for *every* request, because `EncryptedDAO` needed it at
 * construction and construction was eager.
 *
 * With tokens, DAOs and services are factories: `ConnectedApplicationDAO` reads
 * the Secrets Store on first use, so `GET /user/me` — which touches no encrypted
 * state — never pays for it. The memoization is kept, because a DAO constructed
 * per call rather than per request is the cost this composition root exists to
 * avoid.
 *
 * One container per request, never a module singleton: the container closes over
 * `env`, and a Worker isolate serves requests with different `env` values
 * between deployments. Sharing it across requests would hand one deployment's
 * bindings to another.
 */
function createRequestScope(env: RequestScopeEnv): Container {
  const scope = new Container();
  scope.bindValue(Tokens.Env, env);
  scope.bindValue(Tokens.Db, env.DB);

  const config: AppConfigReader = AppConfigReader.fromEnv(env);
  const readConfig = (): AppConfigReader => config;
  scope.bindValue(Tokens.Config, config);

  const masterKey = memoize(async (): Promise<string> => env.AES_ENCRYPTION_KEY_SECRET.get());
  const applicationDAO = memoize(async (): Promise<ConnectedApplicationDAO> => new ConnectedApplicationDAO(env.DB, await masterKey()));
  const apiKeyDAO = memoize((): Promise<ApplicationApiKeyDAO> => Promise.resolve(new ApplicationApiKeyDAO(env.DB)));
  const sessionDAO = memoize((): Promise<OAuth2AuthorizationSessionDAO> => Promise.resolve(new OAuth2AuthorizationSessionDAO(env.DB)));
  const userDAO = memoize((): Promise<UserDAO> => Promise.resolve(new UserDAO(env.DB)));
  const userEmailDAO = memoize((): Promise<UserEmailDAO> => Promise.resolve(new UserEmailDAO(env.DB)));
  const taskRunDAO = memoize((): Promise<BackgroundTaskRunDAO> => Promise.resolve(new BackgroundTaskRunDAO(env.DB)));
  const cacheDAO = memoize(
    async (): Promise<OAuth2AccessTokenCacheDAO> => new OAuth2AccessTokenCacheDAO(env.OAUTH2_TOKEN_CACHE, await masterKey()),
  );

  scope.bindValue(Tokens.ApplicationDAO, applicationDAO);
  scope.bindValue(Tokens.ApiKeyDAO, apiKeyDAO);
  scope.bindValue(Tokens.SessionDAO, sessionDAO);
  scope.bindValue(Tokens.UserDAO, userDAO);
  scope.bindValue(Tokens.UserEmailDAO, userEmailDAO);
  scope.bindValue(Tokens.TaskRunDAO, taskRunDAO);
  scope.bindValue(Tokens.TokenCacheDAO, cacheDAO);

  // One instance per request scope: the kit's `UserIdentityService` memoizes
  // address lookups, and the auth path resolves the same address repeatedly
  // within a request. Constructing it per consumer would defeat the memo — which
  // is the reason it exists.
  scope.bind(Tokens.UserIdentityService, () => new UserIdentityService({ DB: env.DB }, { userDAO, userEmailDAO }));

  scope.bind(
    Tokens.OAuth2AccessTokenService,
    () =>
      new OAuth2AccessTokenService({
        cacheDAO,
        tokenRefreshers: (): DurableObjectNamespace => env.OAUTH2_TOKEN_REFRESHERS,
        config: readConfig,
      }),
  );

  scope.bind(Tokens.ApiKeyService, () => new ApiKeyService({ applicationDAO, apiKeyDAO, config: readConfig }));
  scope.bind(Tokens.ApplicationService, () => new ApplicationService({ applicationDAO, userDAO, userEmailDAO, config: readConfig }));
  scope.bind(Tokens.MailDeliveryService, () => new MailDeliveryService({ applicationDAO, config: readConfig }));
  scope.bind(
    Tokens.OAuth2AuthorizationService,
    () =>
      new OAuth2AuthorizationService({
        applicationDAO,
        sessionDAO,
        accessTokenService: (): OAuth2AccessTokenService => scope.get(Tokens.OAuth2AccessTokenService),
        config: readConfig,
      }),
  );
  scope.bind(
    Tokens.ProcessingService,
    () =>
      new ProcessingService({
        taskRunDAO,
        applicationDAO,
        accessTokenService: (): OAuth2AccessTokenService => scope.get(Tokens.OAuth2AccessTokenService),
      }),
  );
  // SNS is credential-only: no DAO to inject, but the outbound deadline still
  // comes from config rather than a constant in the provider client.
  scope.bind(Tokens.SnsDeliveryService, () => new SnsDeliveryService({ config: readConfig }));
  scope.bind(Tokens.UserService, () => new UserService({ userDAO, userEmailDAO, config: readConfig }));

  return scope;
}

export { createRequestScope };
export { Tokens } from './tokens';
