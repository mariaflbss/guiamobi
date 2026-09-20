import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller';
import { authGuard } from '../../middleware/auth';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', authController.register);
  app.post('/auth/login', authController.login);
  app.post('/auth/forgot-password', authController.forgotPassword);
  app.post('/auth/reset-password', authController.resetPassword);

  // Rota protegida - usada pelo app para validar a sessão salva
  app.get('/auth/me', { preHandler: authGuard }, authController.me);
}
