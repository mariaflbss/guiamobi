import { FastifyReply, FastifyRequest } from 'fastify';
import {
  registerBodySchema,
  loginBodySchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
} from './auth.schema';
import { authService } from './auth.service';
import { usersService } from '../users/users.service';

export const authController = {
  async register(request: FastifyRequest, reply: FastifyReply) {
    const body = registerBodySchema.parse(request.body);
    const user = await authService.register(body);
    return reply.status(201).send({ user });
  },

  async login(request: FastifyRequest, reply: FastifyReply) {
    const body = loginBodySchema.parse(request.body);
    const user = await authService.validateCredentials(body);

    // Token de acesso assinado com os dados mínimos necessários (nunca a senha)
    const accessToken = await reply.jwtSign({ sub: user.id, email: user.email });

    return reply.status(200).send({ user, accessToken });
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
