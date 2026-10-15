export { BaseDAO, EncryptedDAO, assertSqlIdentifier, deleteOlderThan, findRowById } from './BaseDAO';
export { IKeyValueDAO } from './IKeyValueDAO';
export { BackgroundTaskRunDAO } from './BackgroundTaskRunDAO';
export type {
  BackgroundTaskRun,
  BackgroundTaskRunList,
  BackgroundTaskRunStatus,
  ListTaskRunsOptions,
  StartTaskRunInput,
  CompleteTaskRunInput,
} from './BackgroundTaskRunDAO';
export { OAuth2AccessTokenCacheDAO } from './OAuth2AccessTokenCacheDAO';
export { OAuth2AccessTokenRefreshStatusDAO } from './OAuth2AccessTokenRefreshStatusDAO';
export type { OAuth2AccessTokenRefreshStatus } from './OAuth2AccessTokenRefreshStatusDAO';
export { newAccountId, newAnchor, UserDAO } from './UserDAO';
export type { UserRow } from './UserDAO';
/**
 * The `user_emails` address registry is the kit's, verbatim.
 *
 * Mail-Meow's copy was byte-identical, which is the strongest possible statement
 * that a local copy was the wrong answer: nothing had drifted, because nothing
 * had changed since the kit converged them. The one behavioural difference the
 * kit has — a conditional `WHERE user_emails.is_verified = 0` on the upsert, so
 * a racing claim cannot re-point a row that is verified *now* — is a fix, and
 * it is kept.
 */
export { UserEmailDAO } from '@rexezuge/identity';
export type { EmailClaim, UserEmailRow } from '@rexezuge/identity';
export { ConnectedApplicationDAO } from './ConnectedApplicationDAO';
export { ApplicationApiKeyDAO } from './ApplicationApiKeyDAO';
export { OAuth2AuthorizationSessionDAO } from './OAuth2AuthorizationSessionDAO';
