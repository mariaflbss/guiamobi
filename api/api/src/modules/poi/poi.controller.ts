import { FastifyReply, FastifyRequest } from 'fastify';
import { poiQuerySchema } from './poi.schema';
import { poiService } from './poi.service';

export const poiController = {
  async nearby(request: FastifyRequest, reply: FastifyReply) {
    const { lat, lng, radius, categories } = poiQuerySchema.parse(request.query);
    const items = await poiService.nearby(lat, lng, radius, categories);
    return reply.status(200).send({ items });
  },
};
