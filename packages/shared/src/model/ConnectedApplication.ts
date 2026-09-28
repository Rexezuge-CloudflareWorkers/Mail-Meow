import type { ConnectedApplicationStatus, ConnectionMethod, ProviderId } from '../constants';

interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}

interface AccessKeyCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  topicArn: string;
}

type ConnectedApplicationCredentials = OAuth2Credentials | AccessKeyCredentials;

interface ConnectedApplicationMetadata {
  applicationId: string;
  /**
   * The owner's current sign-in address, resolved from `users.current_email`.
   *
   * This is *not* the stored `connected_applications.user_email`, which is the
   * account's frozen anchor. Resolving it here is what stops an opaque
   * `anchor-<hex>@users.invalid` from ever reaching an API response or the
   * provider mailbox recorded on a task run.
   */
  userEmail: string;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: ConnectionMethod;
  status: ConnectedApplicationStatus;
  createdAt: number;
  updatedAt: number;
}

interface ConnectedApplication extends ConnectedApplicationMetadata {
  credentials: ConnectedApplicationCredentials;
}

interface ConnectedApplicationInternal {
  application_id: string;
  /**
  The account's frozen anchor. Retained verbatim, never the identity.
  */
  user_email: string;
  user_id?: string | null;
  /**
  Alias of `user_email` carrying the resolved current address, or NULL.
  */
  user_email_current?: string | null;
  display_name: string;
  provider_id: ProviderId;
  connection_method: ConnectionMethod;
  encrypted_credentials: string;
  credentials_iv: string;
  status: ConnectedApplicationStatus;
  created_at: number;
  updated_at: number;
}

export type {
  AccessKeyCredentials,
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
};
