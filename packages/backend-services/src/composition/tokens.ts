import type { ConnectedApplicationDAO, ApplicationApiKeyDAO, OAuth2AuthorizationSessionDAO, UserDAO } from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-data/utils';
import type { Token } from '@mail-meow/backend-runtime/di';
import type { AppConfiguration } from '@mail-meow/backend-runtime/config';
import type { ApplicationService } from '../application/ApplicationService';
import type { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AuthorizationService } from '../oauth2/OAuth2AuthorizationService';
import type { UserService } from '../user/UserService';
import type { MailDeliveryService } from '../email/MailDeliveryService';
import type { SnsDeliveryService } from '../sns/SnsDeliveryService';
import type { ApiKeyService } from '../apikey/ApiKeyService';
import type { ProcessingService } from '../processing/ProcessingService';

interface RequestScopeEnvShape {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET?: { get(): Promise<string> };
}

interface RequestKeysShape {
  masterKey: string;
}

const Tokens = {
  Env: Symbol('Env') as Token<RequestScopeEnvShape>,
  Db: Symbol('Db') as Token<D1Queryable>,
  Keys: Symbol('Keys') as Token<() => Promise<RequestKeysShape>>,
  ApplicationDAO: Symbol('ApplicationDAO') as Token<() => Promise<ConnectedApplicationDAO>>,
  ApplicationApiKeyDAO: Symbol('ApplicationApiKeyDAO') as Token<() => Promise<ApplicationApiKeyDAO>>,
  OAuth2SessionDAO: Symbol('OAuth2SessionDAO') as Token<() => Promise<OAuth2AuthorizationSessionDAO>>,
  UserDAO: Symbol('UserDAO') as Token<() => Promise<UserDAO>>,
  ApplicationService: Symbol('ApplicationService') as Token<ApplicationService>,
  UserService: Symbol('UserService') as Token<UserService>,
  OAuth2AccessTokenService: Symbol('OAuth2AccessTokenService') as Token<OAuth2AccessTokenService>,
  OAuth2AuthorizationService: Symbol('OAuth2AuthorizationService') as Token<OAuth2AuthorizationService>,
  MailDeliveryService: Symbol('MailDeliveryService') as Token<MailDeliveryService>,
  SnsDeliveryService: Symbol('SnsDeliveryService') as Token<SnsDeliveryService>,
  ApiKeyService: Symbol('ApiKeyService') as Token<ApiKeyService>,
  ProcessingService: Symbol('ProcessingService') as Token<ProcessingService>,
  AppConfig: Symbol('AppConfig') as Token<AppConfiguration>,
} satisfies Record<string, Token<unknown>>;

export { Tokens };
