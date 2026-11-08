import { FastifyReply, FastifyRequest } from 'fastify';
import { notificationsService } from './notifications.service';
import { lineNoticesQuerySchema, replaceSubscriptionsBodySchema } from './notifications.schema';

export const notificationsController = {
  async getSubscriptions(request: FastifyRequest, reply: FastifyReply) {
    const { sub } = request.user as { sub: string };
    const state = await notificationsService.getSubscriptions(sub);
    return reply.status(200).send(state);
  },

  async replaceSubscriptions(request: FastifyRequest, reply: FastifyReply) {
    const { sub } = request.user as { sub: string };
    const body = replaceSubscriptionsBodySchema.parse(request.body);
    const state = await notificationsService.replaceSubscriptions(sub, body.enabled, body.lineIds);
    return reply.status(200).send(state);
  },

  async lineNotices(request: FastifyRequest, reply: FastifyReply) {
    const { sub } = request.user as { sub: string };
    const { lineIds, scenario } = lineNoticesQuerySchema.parse(request.query);

    let ids = lineIds;
    if (!ids) {
      const state = await notificationsService.getSubscriptions(sub);
      ids = state.enabled ? state.lines.map((line) => line.lineId) : [];
    }

    const notices = await notificationsService.getLineNotices(ids, scenario);
    return reply.status(200).send({ notices });
  },
};
