export interface OAuth {
  id: number;
  user_id: number;
  provider: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  created_at: string;
}

export interface OAuthRequest {
  provider: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
}
