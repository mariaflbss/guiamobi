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

    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl, token: rawToken });
    } catch (error) {
      // A resposta externa continua genérica para não permitir enumeração de
      // contas. O erro operacional fica apenas no log do servidor.
      console.error('[RECUPERAÇÃO DE SENHA] Falha no envio do e-mail:', error instanceof Error ? error.message : error);
    }
  },

  /**
   * US01 - Redefinição de senha usando o token recebido por e-mail.
   */
  async resetPassword({ token, newPassword }: ResetPasswordBody) {
    const tokenHash = hashToken(token);
    const now = new Date();
    const passwordHash = await hashPassword(newPassword);

    // A marcação do token como usado e a troca da senha acontecem na mesma
    // transação. O update condicional impede que duas requisições concorrentes
    // consigam usar o mesmo token simultaneamente.
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (claimed.count !== 1) {
        throw new AppError('Link de redefinição inválido ou expirado. Solicite um novo.', 400);
      }

      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
      });

      if (!resetToken) {
        throw new AppError('Link de redefinição inválido ou expirado. Solicite um novo.', 400);
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });
    });
  },
};
