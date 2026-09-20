import { FastifyInstance } from 'fastify';
import { geocodeController } from './geocode.controller';
import { authGuard } from '../../middleware/auth';

/** GET /geocode/search?q=... - busca de endereços (requer login). */
export async function geocodeRoutes(app: FastifyInstance) {
  app.get('/geocode/search', { preHandler: authGuard }, geocodeController.search);
}
