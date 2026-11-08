import { z } from 'zod';

// US01 - Cadastro
export const registerBodySchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome completo'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

// US01 - Login
export const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

// US01 - Solicitar recuperação de senha
export const forgotPasswordBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
});
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;

// US01 - Redefinir senha com o token recebido por e-mail
export const resetPasswordBodySchema = z.object({
  token: z.string().min(1, 'Token inválido'),
  newPassword: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
