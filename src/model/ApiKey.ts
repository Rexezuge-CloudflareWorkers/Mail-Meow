export interface ApiKey {
  id: string;
  user_id: string;
  api_key: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyResponse {
  id: string;
  api_key: string;
  created_at: string;
}
