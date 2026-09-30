import { FastifyReply, FastifyRequest } from 'fastify';
import { geocodeQuerySchema, reverseQuerySchema } from './geocode.schema';
import { geocodeService } from './geocode.service';

export const geocodeController = {
  async search(request: FastifyRequest, reply: FastifyReply) {
    const { q } = geocodeQuerySchema.parse(request.query);
    const payload = request.user as { sub: string };
    const results = await geocodeService.search(payload.sub, q);
    return reply.status(200).send({ results });
  },

  /** Endereço real de uma parada/ponto (nome da rua e número quando o OpenStreetMap tem). */
  async reverse(request: FastifyRequest, reply: FastifyReply) {
    const { lat, lng } = reverseQuerySchema.parse(request.query);
    const payload = request.user as { sub: string };
    const address = await geocodeService.reverse(payload.sub, lat, lng);
    return reply.status(200).send({ address });
  },
};
