import { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Middleware (preHandler) que garante que a rota só seja acessada
 * com um token JWT válido no header Authorization: Bearer <token>.
 */
export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({
      message: 'Sessão inválida ou expirada. Faça login novamente.',
    });
  }
}
