import type { ConnectedApplicationStatus, ConnectionMethod, ProviderId } from '@/constants';

interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  refreshToken?: string | undefined;
}

interface AccessKeyCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  topicArn: string;
}

type ConnectedApplicationCredentials = OAuth2Credentials | AccessKeyCredentials;

interface ConnectedApplicationMetadata {
  applicationId: string;
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
  user_email: string;
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
