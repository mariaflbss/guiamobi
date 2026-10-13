// Tipos relacionados a autenticação e perfil (US01)

export interface User {
  id: string;
  name: string;
  email: string;
  avatarId?: string | null;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface UpdateProfileInput {
  /** A edição direta do perfil permite alterar somente o nome. */
  name: string;
}
