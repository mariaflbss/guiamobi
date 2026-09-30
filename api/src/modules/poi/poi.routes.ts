import { FastifyInstance } from 'fastify';
import { poiController } from './poi.controller';
import { authGuard } from '../../middleware/auth';

/** GET /poi/nearby?lat=&lng=&radius=&categories=hospital,bank - pontos de referência reais (OpenStreetMap). */
export async function poiRoutes(app: FastifyInstance) {
  app.get('/poi/nearby', { preHandler: authGuard }, poiController.nearby);
}
