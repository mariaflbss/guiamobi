import { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth';
import * as movementController from './movement.controller';

export async function movementRoutes(app: FastifyInstance) {
  app.post('/movement/check', { preHandler: authGuard }, movementController.check);
}
