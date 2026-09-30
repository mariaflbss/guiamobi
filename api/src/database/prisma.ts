import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Instância única do Prisma Client, reutilizada em toda a aplicação.
 * Evita abrir múltiplas conexões com o banco em ambiente de desenvolvimento
 * (hot-reload) e em produção.
 */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
