import { FastifyReply, FastifyRequest } from 'fastify';
import { geocodeQuerySchema } from './geocode.schema';
import { geocodeService } from './geocode.service';

export const geocodeController = {
  async search(request: FastifyRequest, reply: FastifyReply) {
    const { q } = geocodeQuerySchema.parse(request.query);
    const payload = request.user as { sub: string };
    const results = await geocodeService.search(payload.sub, q);
    return reply.status(200).send({ results });
  },
};
