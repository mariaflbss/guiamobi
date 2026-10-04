import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { searchRoutesQuerySchema, searchLinesQuerySchema, nearbyLinesQuerySchema } from './routes.schema';
import { routesService } from './routes.service';
import { AppError } from '../../middleware/errorHandler';
import { getRealtimeProvider } from '../../integrations/gtfsRealtime';
import { prisma } from '../../database/prisma';
import { env } from '../../config/env';

const lineIdParamsSchema = z.object({ lineId: z.string().min(1) });

export const routesController = {
  async search(request: FastifyRequest, reply: FastifyReply) {
    const query = searchRoutesQuerySchema.parse(request.query);
    const options = await routesService.searchRoutes(query);
    return reply.status(200).send({ options });
  },

  /**
   * Busca de linha por número ou nome (US06/R07), ex.: GET /routes/lines/search?query=315
   */
  async searchLines(request: FastifyRequest, reply: FastifyReply) {
    const { query } = searchLinesQuerySchema.parse(request.query);
    const lines = await routesService.searchLines(query);
    return reply.status(200).send({ lines });
  },

  /** Sugestões de linhas para quem está perto de uma parada (US09). */
  async nearbyLines(request: FastifyRequest, reply: FastifyReply) {
    const { lat, lng, radius } = nearbyLinesQuerySchema.parse(request.query);
    const lines = await routesService.linesNearPoint(lat, lng, radius);
    return reply.status(200).send({ lines });
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

  /**
   * Posições em tempo real dos veículos de uma linha (US09). Só retorna
   * algo quando GTFS_REALTIME_VEHICLE_POSITIONS_URL está configurada; caso
   * contrário devolve lista vazia + available:false (nunca uma posição
   * inventada).
   */
  async vehiclePositions(request: FastifyRequest, reply: FastifyReply) {
    const { lineId } = lineIdParamsSchema.parse(request.params);
    const line = await prisma.transitLine.findUnique({ where: { id: lineId }, select: { gtfsRouteId: true } });
    if (!line) throw new AppError('Linha não encontrada.', 404);

    const realtime = getRealtimeProvider();
    const availability = await realtime.getAvailability();
    const vehicles = line.gtfsRouteId && availability.vehiclePositionsAvailable
      ? await realtime.getVehiclePositions(line.gtfsRouteId)
      : [];

    return reply.status(200).send({ available: availability.vehiclePositionsAvailable, vehicles });
  },

  /**
   * Avisos operacionais (interrupção, desvio) de uma linha (US06/US09).
   * Distinto de "atraso": um alerta é texto livre da operadora sobre um
   * problema, não uma previsão numérica.
   */
  async serviceAlerts(request: FastifyRequest, reply: FastifyReply) {
    const { lineId } = lineIdParamsSchema.parse(request.params);
    // Opções calculadas pela Google usam IDs virtuais e não existem no catálogo local.
    // Não inventamos alerta: a ausência de dado operacional da Google significa sem alerta disponível.
    if (lineId.startsWith('google:')) {
      return reply.status(200).send({ available: false, alerts: [] });
    }

    const line = await prisma.transitLine.findUnique({ where: { id: lineId }, select: { gtfsRouteId: true, code: true } });
    if (!line) throw new AppError('Linha não encontrada.', 404);

    // A fixture permite simular um problema operacional sem apresentar esse
    // cenário como dado real. O valor fica explícito em MOCK_TRANSIT_SCENARIO.
    const mockScenario = env.MOCK_TRANSIT_SCENARIO;
    if (mockScenario === `delayed-${line.code}` || mockScenario === `unavailable-${line.code}`) {
      return reply.status(200).send({
        available: true,
        alerts: [{
          id: `mock-${line.code}-${mockScenario}`,
          affectedLineIds: [line.id],
          headerText: mockScenario.startsWith('delayed-') ? 'Simulação: linha atrasada' : 'Simulação: linha indisponível',
          descriptionText: 'Cenário de teste local da US06. Não representa uma ocorrência real do transporte.',
          severity: mockScenario.startsWith('delayed-') ? 'WARNING' : 'CRITICAL',
        }],
      });
    }

    const realtime = getRealtimeProvider();
    const availability = await realtime.getAvailability();
    const alerts = line.gtfsRouteId && availability.serviceAlertsAvailable
      ? await realtime.getServiceAlerts(line.gtfsRouteId)
      : [];

    return reply.status(200).send({ available: availability.serviceAlertsAvailable, alerts });
  },
};
