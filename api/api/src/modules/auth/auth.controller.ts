import { FastifyReply, FastifyRequest } from 'fastify';
import {
  registerBodySchema,
  loginBodySchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
} from './auth.schema';
import { authService } from './auth.service';
import { usersService } from '../users/users.service';
import { env } from '../../config/env';

export const authController = {
  async register(request: FastifyRequest, reply: FastifyReply) {
    const body = registerBodySchema.parse(request.body);
    const user = await authService.register(body);
    return reply.status(201).send({ user });
  },

  async login(request: FastifyRequest, reply: FastifyReply) {
    const body = loginBodySchema.parse(request.body);
    const user = await authService.validateCredentials(body);

    // Access token curto + refresh token longo. O app renova o access token
    // automaticamente quando uma chamada encontra expiração, sem derrubar a sessão.
    const accessToken = await reply.jwtSign({ sub: user.id, email: user.email });
    const refreshToken = await reply.jwtSign(
      { sub: user.id, email: user.email, type: 'refresh' },
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
    );

    return reply.status(200).send({ user, accessToken, refreshToken });
  },

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as { refreshToken?: string };
    if (!body?.refreshToken) {
      return reply.status(401).send({ message: 'Sessão inválida. Faça login novamente.' });
    }

    try {
      const payload = await request.server.jwt.verify<{ sub: string; email: string; type?: string }>(body.refreshToken);
      if (payload.type !== 'refresh' || !payload.sub) {
        return reply.status(401).send({ message: 'Sessão inválida. Faça login novamente.' });
      }

      const user = await usersService.getProfile(payload.sub);
      const accessToken = await reply.jwtSign({ sub: user.id, email: user.email });
      const refreshToken = await reply.jwtSign(
        { sub: user.id, email: user.email, type: 'refresh' },
        { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
      );

      return reply.status(200).send({ user, accessToken, refreshToken });
    } catch {
      return reply.status(401).send({ message: 'Sessão inválida. Faça login novamente.' });
    }
  },

  async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    const body = forgotPasswordBodySchema.parse(request.body);
    await authService.forgotPassword(body);

    // Resposta sempre genérica, independentemente de o e-mail existir
    return reply.status(200).send({
      message: 'Se este e-mail estiver cadastrado, você receberá as instruções de recuperação em instantes.',
    });
  },

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const body = resetPasswordBodySchema.parse(request.body);
    await authService.resetPassword(body);
    return reply.status(200).send({ message: 'Senha redefinida com sucesso.' });
  },

  /**
   * Retorna os dados do usuário autenticado (usado pelo app para restaurar
   * a sessão ao abrir novamente, validando se o token ainda é válido).
   */
  async me(request: FastifyRequest, reply: FastifyReply) {
    const payload = request.user as { sub: string; email: string };
    const user = await usersService.getProfile(payload.sub);
    return reply.status(200).send({ user });
  },
};
