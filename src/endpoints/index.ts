/* eslint-disable @typescript-eslint/no-explicit-any */

import { GetCurrentUserRoute as OriginalGetCurrentUserRoute } from './user/me/GET';
import { ListApplicationsRoute as OriginalListApplicationsRoute } from './user/applications/GET';
import { CreateApplicationRoute as OriginalCreateApplicationRoute } from './user/application/POST';
import { UpdateApplicationRoute as OriginalUpdateApplicationRoute } from './user/application/PUT';
import { DeleteApplicationRoute as OriginalDeleteApplicationRoute } from './user/application/DELETE';
import { CreateOAuth2AuthorizationRoute as OriginalCreateOAuth2AuthorizationRoute } from './user/application/oauth2/authorize/POST';
import { ListApplicationApiKeysRoute as OriginalListApplicationApiKeysRoute } from './user/application/api-keys/GET';
import { CreateApplicationApiKeyRoute as OriginalCreateApplicationApiKeyRoute } from './user/application/api-key/POST';
import { DeleteApplicationApiKeyRoute as OriginalDeleteApplicationApiKeyRoute } from './user/application/api-key/DELETE';
import { OAuth2CallbackRoute as OriginalOAuth2CallbackRoute } from './api/oauth2/callback/GET';
import { SendEmailRoute as OriginalSendEmailRoute } from './api/email/POST';
import { SendSNSRoute as OriginalSendSNSRoute } from './api/sns/POST';

export const GetCurrentUserRoute: any = OriginalGetCurrentUserRoute;
export const ListApplicationsRoute: any = OriginalListApplicationsRoute;
export const CreateApplicationRoute: any = OriginalCreateApplicationRoute;
export const UpdateApplicationRoute: any = OriginalUpdateApplicationRoute;
export const DeleteApplicationRoute: any = OriginalDeleteApplicationRoute;
export const CreateOAuth2AuthorizationRoute: any = OriginalCreateOAuth2AuthorizationRoute;
export const ListApplicationApiKeysRoute: any = OriginalListApplicationApiKeysRoute;
export const CreateApplicationApiKeyRoute: any = OriginalCreateApplicationApiKeyRoute;
export const DeleteApplicationApiKeyRoute: any = OriginalDeleteApplicationApiKeyRoute;
export const OAuth2CallbackRoute: any = OriginalOAuth2CallbackRoute;
export const SendEmailRoute: any = OriginalSendEmailRoute;
export const SendSNSRoute: any = OriginalSendSNSRoute;
