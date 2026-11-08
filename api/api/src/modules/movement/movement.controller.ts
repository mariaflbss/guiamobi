import { FastifyReply, FastifyRequest } from 'fastify';
import { AccessTokenPayload } from '../../utils/jwt';
import { movementCheckBodySchema } from './movement.schema';
import { checkMovement } from './movement.service';

export async function check(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.user as AccessTokenPayload;
  const parsed = movementCheckBodySchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({ message: 'Coordenadas de movimentação inválidas.' });
  }

  const result = await checkMovement(payload.sub, parsed.data);
  return reply.send(result);
}
