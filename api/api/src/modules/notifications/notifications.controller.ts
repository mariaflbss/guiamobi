import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { notificationsService } from './notifications.service';

const deviceBodySchema = z.object({
  expoPushToken: z.string().min(1),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
});

const subscriptionBodySchema = z.object({
  lineId: z.string().min(1),
});

const lineIdParamsSchema = z.object({
  lineId: z.string().min(1),
});

function userId(request: FastifyRequest): string {
  return (request.user as { sub: string }).sub;
}

export const notificationsController = {
  async registerDevice(request: FastifyRequest, reply: FastifyReply) {
    const body = deviceBodySchema.parse(request.body);
    await notificationsService.registerDevice(userId(request), body.expoPushToken, body.platform);
    return reply.status(204).send();
  },

  async unregisterDevices(request: FastifyRequest, reply: FastifyReply) {
    await notificationsService.unregisterDevices(userId(request));
    return reply.status(204).send();
  },

  async listSubscriptions(request: FastifyRequest, reply: FastifyReply) {
    const subscriptions = await notificationsService.listSubscriptions(userId(request));
    return reply.status(200).send({ subscriptions });
  },

  async subscribe(request: FastifyRequest, reply: FastifyReply) {
    const body = subscriptionBodySchema.parse(request.body);
    try {
      const subscription = await notificationsService.subscribeToLine(userId(request), body.lineId);
      return reply.status(201).send({ subscription });
    } catch (error) {
      if (error instanceof Error && error.message === 'Linha não encontrada.') {
        return reply.status(404).send({ message: error.message });
      }
      throw error;
    }
  },

  async unsubscribe(request: FastifyRequest, reply: FastifyReply) {
    const { lineId } = lineIdParamsSchema.parse(request.params);
    await notificationsService.unsubscribeFromLine(userId(request), lineId);
    return reply.status(204).send();
  },
};
