export interface User {
  email: string;
  password_hash: string;
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
