export interface OAuth {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OAuthRequest {
  provider: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}
