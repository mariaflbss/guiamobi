import { FastifyReply, FastifyRequest } from 'fastify';
import { usersService } from './users.service';
import { updateProfileBodySchema } from './users.schema';

export const usersController = {
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const payload = request.user as { sub: string };
    const user = await usersService.getProfile(payload.sub);
    return reply.status(200).send({ user });
  },

  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const payload = request.user as { sub: string };
    const body = updateProfileBodySchema.parse(request.body);
    const user = await usersService.updateProfile(payload.sub, body);
    return reply.status(200).send({ user });
  },
};
