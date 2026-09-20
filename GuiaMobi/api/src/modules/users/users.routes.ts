import { FastifyInstance } from 'fastify';
import { usersController } from './users.controller';
import { authGuard } from '../../middleware/auth';

export async function usersRoutes(app: FastifyInstance) {
  app.get('/users/me', { preHandler: authGuard }, usersController.getProfile);
  app.patch('/users/me', { preHandler: authGuard }, usersController.updateProfile);
}
