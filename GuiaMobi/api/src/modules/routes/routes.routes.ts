import { FastifyInstance } from 'fastify';
import { routesController } from './routes.controller';
import { authGuard } from '../../middleware/auth';

/**
 * Rotas do módulo de transporte (Prioridade 1): busca de rotas por
 * origem/destino e detalhe de uma linha. Protegidas por login, já que só
 * fazem sentido para um usuário autenticado dentro do app.
 */
export async function transitRoutes(app: FastifyInstance) {
  app.get('/routes/search', { preHandler: authGuard }, routesController.search);
  app.get('/routes/lines/:lineId', { preHandler: authGuard }, routesController.detail);
  app.get('/transit/status', { preHandler: authGuard }, routesController.status);
}
