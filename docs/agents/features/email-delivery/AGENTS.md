# Mail-Meow — Email Delivery

Scope: public delivery endpoints + provider sending. Parent index: `../../../AGENTS.md`.

- `POST /api/:api_key/email` (`SendEmailRoute`) — resolves API key via `ApiKeyService`, requires `oauth2` + `connected`, refreshes token via `OAuth2ProviderUtil.refreshAccessToken` (rotates `refreshToken` when returned), sends via `MailDeliveryUtil.sendEmail` (Gmail API vs Graph `/consumers`).
- `POST /api/:api_key/sns` (`SendSNSRoute`) — requires `amazon-sns` + `access-keys` + `connected`, publishes via `SnsDeliveryUtil.publish` (`aws4fetch`, region from ARN).
- Services: `MailDeliveryService.sendEmailForApplication`, `SnsDeliveryService.publishForApplication` (both throw `BadRequestError` when key is not linked to an authorized app).
- Provider clients: `packages/provider-clients` (`OAuth2ProviderUtil` + `MailDeliveryUtil` + `SnsDeliveryUtil` + `gmail/getProfile` + `outlook/getProfile` for token refresh worker).
- Encrypted credentials: AES-GCM-256 (`backend-data/crypto`), key in Secrets Store `AES_ENCRYPTION_KEY_SECRET`; never store plain.
