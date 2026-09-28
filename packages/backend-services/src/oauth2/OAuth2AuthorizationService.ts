import { CONNECTION_METHOD_OAUTH2 } from '@mail-meow/shared/constants';
import type { ConnectedApplicationDAO, OAuth2AuthorizationSessionDAO } from '@mail-meow/backend-data/dao';
import type { AppConfigReader } from '@mail-meow/backend-runtime/config';
import { BadRequestError, NotFoundError } from '@mail-meow/backend-errors';
import type { AccountIdentity, ConnectedApplication, OAuth2AuthorizationSession, OAuth2Credentials } from '@mail-meow/shared/model';
import { BaseUrlUtil, TimestampUtil } from '@mail-meow/shared/utils';
import { OAuth2ProviderUtil } from '@mail-meow/provider-clients/oauth2';
import type { OAuth2AccessTokenService } from './OAuth2AccessTokenService';
import { OAuth2StateUtil } from './OAuth2StateUtil';

interface OAuth2AuthorizationResult {
  authorizationUrl: string;
  redirectUri: string;
  expiresAt: number;
}

interface CompleteOAuth2CallbackInput {
  applicationId: string;
  code: string;
  state: string;
}

interface OAuth2AuthorizationServiceDeps {
  applicationDAO: () => Promise<ConnectedApplicationDAO>;
  sessionDAO: () => Promise<OAuth2AuthorizationSessionDAO>;
  accessTokenService: () => OAuth2AccessTokenService;
  config: () => AppConfigReader;
}

class OAuth2AuthorizationService {
  constructor(private readonly deps: OAuth2AuthorizationServiceDeps) {}

  /**
  Starts the consent flow: mints a PKCE pair and a one-time `state`.
  */
  async createAuthorization(user: AccountIdentity, applicationId: string, raw: Request): Promise<OAuth2AuthorizationResult> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(applicationId, user);
    if (!application) {
      throw new NotFoundError('Connected application was not found.');
    }
    if (application.connectionMethod !== CONNECTION_METHOD_OAUTH2) {
      throw new BadRequestError('Connected application does not use OAuth2.');
    }

    const credentials: OAuth2Credentials = application.credentials as OAuth2Credentials;
    const state: string = OAuth2StateUtil.generateState();
    const codeVerifier: string = OAuth2StateUtil.generateCodeVerifier();
    const codeChallenge: string = await OAuth2StateUtil.getCodeChallenge(codeVerifier);
    const redirectUri: string = `${BaseUrlUtil.getBaseUrl(raw)}/api/oauth2/callback/${application.applicationId}`;
    const expiresAt: number = TimestampUtil.addMinutes(
      TimestampUtil.getCurrentUnixTimestampInSeconds(),
      this.deps.config().oauth2StateExpiryMinutes,
    );

    const sessionDAO: OAuth2AuthorizationSessionDAO = await this.deps.sessionDAO();
    await sessionDAO.create(application.applicationId, await OAuth2StateUtil.getStateHash(state), codeVerifier, redirectUri, expiresAt);

    return {
      authorizationUrl: OAuth2ProviderUtil.buildAuthorizationUrl({
        providerId: application.providerId,
        clientId: credentials.clientId,
        redirectUri,
        state,
        codeChallenge,
      }),
      redirectUri,
      expiresAt,
    };
  }

  async completeCallback(input: CompleteOAuth2CallbackInput): Promise<void> {
    const sessionDAO: OAuth2AuthorizationSessionDAO = await this.deps.sessionDAO();
    const session: OAuth2AuthorizationSession | undefined = await sessionDAO.getActive(
      input.applicationId,
      await OAuth2StateUtil.getStateHash(input.state),
    );
    if (!session) {
      throw new BadRequestError('OAuth2 authorization session is invalid or expired.');
    }

    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    if (!(await applicationDAO.getById(input.applicationId))) {
      throw new NotFoundError('Connected application was not found.');
    }

    // Claim the session BEFORE exchanging the code. Exchanging first and
    // consuming afterwards left a replay window: two callbacks carrying the same
    // `state` both passed getActive, and the loser's consume() reported success
    // even though its UPDATE matched zero rows. Burning the session first is safe
    // because the authorization code is single-use at the provider too, so a
    // failed exchange just means restarting the flow.
    if (!(await sessionDAO.consume(session.sessionId))) {
      throw new BadRequestError('OAuth2 authorization session is invalid or expired.');
    }

    await this.deps.accessTokenService().completeAuthorization({
      applicationId: input.applicationId,
      redirectUri: session.redirectUri,
      code: input.code,
      codeVerifier: session.codeVerifier,
    });
  }
}

export { OAuth2AuthorizationService };
export type { CompleteOAuth2CallbackInput, OAuth2AuthorizationResult, OAuth2AuthorizationServiceDeps };
