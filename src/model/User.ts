export interface User {
  id: number;
  email: string;
  hashed_password: string;
  api_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
}

export interface UserResponse {
  email: string;
  created_at: string;
}
