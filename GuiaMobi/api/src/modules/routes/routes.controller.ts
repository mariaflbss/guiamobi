import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { searchRoutesQuerySchema } from './routes.schema';
import { routesService } from './routes.service';
import { AppError } from '../../middleware/errorHandler';

const lineIdParamsSchema = z.object({ lineId: z.string().min(1) });

export const routesController = {
  async search(request: FastifyRequest, reply: FastifyReply) {
    const query = searchRoutesQuerySchema.parse(request.query);
    const options = await routesService.searchRoutes(query);
    return reply.status(200).send({ options });
  },

  async detail(request: FastifyRequest, reply: FastifyReply) {
    const { lineId } = lineIdParamsSchema.parse(request.params);
    const line = await routesService.getLineDetail(lineId);

    if (!line) {
      throw new AppError('Linha não encontrada.', 404);
    }

    return reply.status(200).send({ line });
  },

  /**
   * Situação dos dados de transporte: o app usa para explicar ao usuário,
   * sem inventar rotas, por que uma busca não trouxe resultado.
   */
  async status(_request: FastifyRequest, reply: FastifyReply) {
    const status = await routesService.getStatus();
    return reply.status(200).send(status);
  },
};
