import { FastifyInstance } from 'fastify';
import { notificationsController } from './notifications.controller';
import { authGuard } from '../../middleware/auth';

/**
 * Notificações sobre alterações nas linhas (US17). O estado principal vive no
 * aparelho; estas rotas guardam uma cópia por conta (restaurar em outro
 * aparelho) e entregam os avisos em vigor das linhas acompanhadas.
 */
export async function notificationsRoutes(app: FastifyInstance) {
  app.get('/notifications/subscriptions', { preHandler: authGuard }, notificationsController.getSubscriptions);
  app.put('/notifications/subscriptions', { preHandler: authGuard }, notificationsController.replaceSubscriptions);
  app.get('/notifications/line-notices', { preHandler: authGuard }, notificationsController.lineNotices);
}
