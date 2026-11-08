import jwtPlugin from '@fastify/jwt';
import { FastifyInstance } from 'fastify';
import { env } from '../config/env';

/**
 * Registra o plugin @fastify/jwt na instância do Fastify.
 * Os tokens de acesso são usados para autenticar as rotas privadas da API.
 */
export function registerJwt(app: FastifyInstance) {
  app.register(jwtPlugin, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  });
}

export interface AccessTokenPayload {
  sub: string; // id do usuário
  email: string;
}
