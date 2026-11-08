import { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth';
import { notificationsController } from './notifications.controller';

export async function notificationsRoutes(app: FastifyInstance) {
  app.get('/notifications/subscriptions', { preHandler: authGuard }, notificationsController.listSubscriptions);
  app.post('/notifications/subscriptions', { preHandler: authGuard }, notificationsController.subscribe);
  app.delete('/notifications/subscriptions/:lineId', { preHandler: authGuard }, notificationsController.unsubscribe);
  app.post('/notifications/devices', { preHandler: authGuard }, notificationsController.registerDevice);
  app.delete('/notifications/devices', { preHandler: authGuard }, notificationsController.unregisterDevices);
}
