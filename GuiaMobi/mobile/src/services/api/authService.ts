import { httpClient } from './httpClient';
import {
  AuthSession,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
  User,
} from '../../types/auth';

/**
 * Serviço de autenticação: única camada que conhece os endpoints da API
 * relacionados a login/cadastro/recuperação de senha (US01).
 */
export const authService = {
  async register(input: RegisterInput): Promise<{ user: User }> {
    return httpClient('/auth/register', { method: 'POST', body: input });
  },

  async login(input: LoginInput): Promise<AuthSession> {
    return httpClient('/auth/login', { method: 'POST', body: input });
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<{ message: string }> {
    return httpClient('/auth/forgot-password', { method: 'POST', body: input });
  },

  async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    return httpClient('/auth/reset-password', { method: 'POST', body: input });
  },

  async me(): Promise<{ user: User }> {
    return httpClient('/auth/me', { method: 'GET', authenticated: true });
  },

  async updateProfile(input: UpdateProfileInput): Promise<{ user: User }> {
    return httpClient('/users/me', { method: 'PATCH', body: input, authenticated: true });
  },
};
