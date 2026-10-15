import type {
  ApplicationApiKeyDAO,
  BackgroundTaskRunDAO,
  ConnectedApplicationDAO,
  OAuth2AccessTokenCacheDAO,
  OAuth2AuthorizationSessionDAO,
  UserDAO,
  UserEmailDAO,
} from '@mail-meow/backend-data/dao';
import type { D1Queryable } from '@mail-meow/backend-runtime/base';
import type { AppConfigReader } from '@mail-meow/backend-runtime/config';
import type { Token } from '@rexezuge/runtime';
import type { ApiKeyService } from '../apikey/ApiKeyService';
import type { ApplicationService } from '../application/ApplicationService';
import type { MailDeliveryService } from '../email/MailDeliveryService';
import type { UserIdentityService } from '../identity';
import type { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AuthorizationService } from '../oauth2/OAuth2AuthorizationService';
import type { ProcessingService } from '../processing/ProcessingService';
import type { SnsDeliveryService } from '../sns/SnsDeliveryService';
import type { UserService } from '../user/UserService';

/**
 * The `env` surface a request needs.
 *
 * Deliberately narrow and fully typed. Each route binds only what that route
 * uses, so every service collaborator arrives as an async factory rather than a
 * resolved value — a D1 handle costs nothing to hand out, but a Secrets Store
 * read must not happen on a request that never encrypts.
 */
interface RequestScopeEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: { get(): Promise<string> };
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
}

/**
 * The token registry for the per-request composition root.
 *
 * Tokens carry their value type (`Token<T>`) so `scope.get(Tokens.X)` infers the
 * service type without an explicit generic at the call site — which is what
 * makes the 14 route call sites read as `scope.get(Tokens.users)` rather than
 * `scope.get<ApiKeyService>(Tokens.ApiKeyService)`.
 *
 * `satisfies Record<string, Token<unknown>>` is what makes the registry
 * exhaustive in the other direction: adding a key that is not a token, or
 * forgetting the registration, fails here rather than at a call site that
 * resolves `undefined`.
 */
const Tokens = {
  Env: Symbol('Env') as Token<RequestScopeEnv>,
  Db: Symbol('Db') as Token<D1Queryable>,
  Config: Symbol('Config') as Token<AppConfigReader>,
  ApplicationDAO: Symbol('ApplicationDAO') as Token<() => Promise<ConnectedApplicationDAO>>,
  ApiKeyDAO: Symbol('ApiKeyDAO') as Token<() => Promise<ApplicationApiKeyDAO>>,
  SessionDAO: Symbol('SessionDAO') as Token<() => Promise<OAuth2AuthorizationSessionDAO>>,
  TaskRunDAO: Symbol('TaskRunDAO') as Token<() => Promise<BackgroundTaskRunDAO>>,
  TokenCacheDAO: Symbol('TokenCacheDAO') as Token<() => Promise<OAuth2AccessTokenCacheDAO>>,
  UserDAO: Symbol('UserDAO') as Token<() => Promise<UserDAO>>,
  UserEmailDAO: Symbol('UserEmailDAO') as Token<() => Promise<UserEmailDAO>>,
  ApiKeyService: Symbol('ApiKeyService') as Token<ApiKeyService>,
  ApplicationService: Symbol('ApplicationService') as Token<ApplicationService>,
  UserIdentityService: Symbol('UserIdentityService') as Token<UserIdentityService>,
  MailDeliveryService: Symbol('MailDeliveryService') as Token<MailDeliveryService>,
  OAuth2AccessTokenService: Symbol('OAuth2AccessTokenService') as Token<OAuth2AccessTokenService>,
  OAuth2AuthorizationService: Symbol('OAuth2AuthorizationService') as Token<OAuth2AuthorizationService>,
  ProcessingService: Symbol('ProcessingService') as Token<ProcessingService>,
  SnsDeliveryService: Symbol('SnsDeliveryService') as Token<SnsDeliveryService>,
  UserService: Symbol('UserService') as Token<UserService>,
} satisfies Record<string, Token<unknown>>;

export { Tokens };
export type { RequestScopeEnv };
