import { prisma } from '../../database/prisma';
import { AppError } from '../../middleware/errorHandler';
import { generateRawToken, hashPassword, hashToken, verifyPassword } from '../../utils/hash';
import { sendPasswordResetEmail } from '../../integrations/email/emailSender';
import { env } from '../../config/env';
import { RegisterBody, LoginBody, ForgotPasswordBody, ResetPasswordBody } from './auth.schema';

const RESET_TOKEN_TTL_MINUTES = 30;

export const authService = {
  /**
   * US01 - Cadastro de novo usuário.
   */
  async register({ name, email, password }: RegisterBody) {
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      throw new AppError('Este e-mail já está cadastrado.', 409);
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });

    return { id: user.id, name: user.name, email: user.email, avatarId: user.avatarId };
  },

  /**
   * US01 - Login. Retorna os dados do usuário autenticado (o token é
   * assinado no controller, que tem acesso à instância do Fastify).
   */
  async validateCredentials({ email, password }: LoginBody) {
    const user = await prisma.user.findUnique({ where: { email } });

    // Mensagem genérica de propósito: não revelar se o e-mail existe ou não
    const invalidCredentialsMessage = 'E-mail ou senha inválidos.';

    if (!user) {
      throw new AppError(invalidCredentialsMessage, 401);
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, password);

    if (!isPasswordValid) {
      throw new AppError(invalidCredentialsMessage, 401);
    }

    return { id: user.id, name: user.name, email: user.email, avatarId: user.avatarId };
  },

  /**
   * US01 - Solicitação de recuperação de senha.
   * Sempre responde com sucesso (mesmo se o e-mail não existir) para não
   * expor quais e-mails estão cadastrados na base.
   */
  async forgotPassword({ email }: ForgotPasswordBody) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return; // resposta genérica é tratada no controller
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${env.APP_RESET_PASSWORD_URL}?token=${rawToken}`;

    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl, token: rawToken });
  },

  /**
   * US01 - Redefinição de senha usando o token recebido por e-mail.
   */
  async resetPassword({ token, newPassword }: ResetPasswordBody) {
    const tokenHash = hashToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new AppError('Link de redefinição inválido ou expirado. Solicite um novo.', 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);
  },
};
