import {
  ApplicationApiKeyDAO,
  ConnectedApplicationDAO,
  OAuth2AuthorizationSessionDAO,
  UserDAO,
} from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import { Container } from '@mail-meow/backend-runtime/di';
import { AppConfiguration } from '@mail-meow/backend-runtime/config';
import { ApplicationService } from '@mail-meow/backend-services/application';
import { OAuth2AccessTokenService, OAuth2AuthorizationService } from '@mail-meow/backend-services/oauth2';
import { UserService } from '@mail-meow/backend-services/user';
import { MailDeliveryService } from '@mail-meow/backend-services/email';
import { SnsDeliveryService } from '@mail-meow/backend-services/sns';
import { ApiKeyService } from '@mail-meow/backend-services/apikey';
import { ProcessingService } from '@mail-meow/backend-services/processing';
import { Tokens } from './tokens';

interface RequestScopeEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET?: { get(): Promise<string> };
}

interface RequestKeys {
  masterKey: string;
}

function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= fn());
}

function createRequestScope(env: RequestScopeEnv): Container {
  const scope = new Container();
  scope.bindValue(Tokens.Env, env);
  scope.bindValue(Tokens.Db, env.DB);

  const masterKey = memoize(() => {
    if (!env.AES_ENCRYPTION_KEY_SECRET) throw new Error('AES_ENCRYPTION_KEY_SECRET is not configured for this scope.');
    return env.AES_ENCRYPTION_KEY_SECRET.get();
  });
  const keys = memoize(async (): Promise<RequestKeys> => ({ masterKey: await masterKey() }));
  scope.bindValue(Tokens.Keys, keys);

  const applicationDAO = memoize(async () => new ConnectedApplicationDAO(env.DB, await masterKey()));
  const apiKeyDAO = memoize(() => Promise.resolve(new ApplicationApiKeyDAO(env.DB)));
  const sessionDAO = memoize(() => Promise.resolve(new OAuth2AuthorizationSessionDAO(env.DB)));
  const userDAO = memoize(() => Promise.resolve(new UserDAO(env.DB)));
  scope.bindValue(Tokens.ApplicationDAO, applicationDAO);
  scope.bindValue(Tokens.ApplicationApiKeyDAO, apiKeyDAO);
  scope.bindValue(Tokens.OAuth2SessionDAO, sessionDAO);
  scope.bindValue(Tokens.UserDAO, userDAO);

  scope.bind(Tokens.ApplicationService, () => new ApplicationService(env as never));
  scope.bind(Tokens.UserService, () => new UserService(env as never, { userDAO }));
  scope.bind(Tokens.OAuth2AccessTokenService, () => new OAuth2AccessTokenService(env as never));
  scope.bind(Tokens.OAuth2AuthorizationService, () => new OAuth2AuthorizationService(env as never));
  scope.bind(Tokens.MailDeliveryService, () => new MailDeliveryService(env as never));
  scope.bind(Tokens.SnsDeliveryService, () => new SnsDeliveryService());
  scope.bind(Tokens.ApiKeyService, () => new ApiKeyService(env as never));
  scope.bind(Tokens.AppConfig, () => AppConfiguration.fromEnv(env));
  scope.bind(Tokens.ProcessingService, () => new ProcessingService(env as never));

  return scope;
}

export { createRequestScope };
export type { RequestKeys, RequestScopeEnv };
