import { prisma } from '../../../database/prisma';
import { boundingBoxDeltas, estimateWalkMinutes, haversineDistanceMeters } from './geoUtils';
import {
  LineDetail,
  LineSearchResult,
  NearbyLine,
  RouteOption,
  SearchRoutesQueryInput,
  TransitProvider,
  TransitStatus,
} from './types';

const MAX_WALK_DISTANCE_METERS = 1200;

/**
 * Provider "de verdade": lê exclusivamente dados com dataSource =
 * OFFICIAL_GTFS, importados por api/src/integrations/gtfs/gtfsImporter.ts a
 * partir de um feed GTFS oficial completo (agency, routes, stops, trips,
 * stop_times, calendar, calendar_dates, shapes).
 *
 * Sem nenhum limite artificial: processa TODAS as linhas/paradas/viagens que
 * estiverem marcadas OFFICIAL_GTFS no banco, sejam 3 ou 3000. A busca é por
 * VIAGEM (trip) real, não por uma sequência fixa por linha como na fixture -
 * isso é o que permite considerar corretamente sentidos diferentes, viagens
 * que não circulam num certo dia (calendar/calendar_dates) e horários reais
 * de stop_times.
 */
export class GtfsDatabaseProvider implements TransitProvider {
  readonly name = 'official-gtfs' as const;

  async getStatus(): Promise<TransitStatus> {
    const [linesCount, linesWithTripsCount, stopsCount, latest] = await Promise.all([
      prisma.transitLine.count({ where: { dataSource: 'OFFICIAL_GTFS' } }),
      prisma.transitLine.count({ where: { dataSource: 'OFFICIAL_GTFS', trips: { some: {} } } }),
      prisma.transitStop.count({ where: { gtfsStopId: { not: null } } }),
      prisma.transitLine.findFirst({
        where: { dataSource: 'OFFICIAL_GTFS' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      hasData: linesWithTripsCount > 0,
      linesCount,
      linesWithRouteDataCount: linesWithTripsCount,
      source: linesCount > 0 ? 'gtfs-import' : null,
      stopsCount,
      importedAt: latest ? latest.createdAt.toISOString() : null,
      provider: 'official-gtfs',
    };
  }

  /**
   * Busca paradas OFFICIAL_GTFS num raio, com um filtro barato de bounding
   * box no banco antes do cálculo preciso por Haversine em memória - é isso
   * que permite escalar para uma rede com milhares de paradas sem varrer a
   * tabela inteira a cada busca.
   */
  private async nearbyStops(latitude: number, longitude: number, radiusMeters: number) {
    const { deltaLat, deltaLon } = boundingBoxDeltas(latitude, radiusMeters);

    const candidates = await prisma.transitStop.findMany({
      where: {
        gtfsStopId: { not: null },
        latitude: { gte: latitude - deltaLat, lte: latitude + deltaLat },
        longitude: { gte: longitude - deltaLon, lte: longitude + deltaLon },
      },
    });

    return candidates
      .map((stop) => ({ stop, distanceMeters: haversineDistanceMeters(latitude, longitude, stop.latitude, stop.longitude) }))
      .filter((c) => c.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  async searchRoutes(query: SearchRoutesQueryInput): Promise<RouteOption[]> {
    const [originCandidates, destCandidates] = await Promise.all([
      this.nearbyStops(query.originLat, query.originLng, MAX_WALK_DISTANCE_METERS),
      this.nearbyStops(query.destinationLat, query.destinationLng, MAX_WALK_DISTANCE_METERS),
    ]);

    if (originCandidates.length === 0 || destCandidates.length === 0) return [];

    const originStopIds = originCandidates.map((c) => c.stop.id);
    const destStopIds = destCandidates.map((c) => c.stop.id);
    const originDistanceByStopId = new Map<string, number>(originCandidates.map((c) => [c.stop.id, c.distanceMeters] as [string, number]));
    const destDistanceByStopId = new Map<string, number>(destCandidates.map((c) => [c.stop.id, c.distanceMeters] as [string, number]));

    // Viagens que passam por pelo menos uma parada candidata de origem
    const originStopTimes = await prisma.transitStopTime.findMany({
      where: { stopId: { in: originStopIds }, trip: { line: { dataSource: 'OFFICIAL_GTFS' } } },
      include: {
        stop: true,
        trip: {
          include: {
            line: { include: { status: true } },
            service: { include: { exceptions: true } },
            stopTimes: { where: { stopId: { in: destStopIds } }, include: { stop: true } },
          },
        },
      },
    });

    const today = new Date();
    const bestByLine = new Map<string, RouteOption>();

    for (const originStopTime of originStopTimes) {
      const trip = originStopTime.trip;
      if (!isServiceValidOn(trip.service, today)) continue;
      if (trip.line.status?.status === 'UNAVAILABLE') continue;

      // Precisa de uma parada de destino candidata NA MESMA VIAGEM, depois da origem
      const alightingStopTime = trip.stopTimes
        .filter((st) => st.sequence > originStopTime.sequence)
        .sort((a, b) => a.sequence - b.sequence)[0];
      if (!alightingStopTime) continue;

      const scheduledMinutes = timeStringToMinutes(alightingStopTime.arrivalTime) - timeStringToMinutes(originStopTime.departureTime);
      if (scheduledMinutes <= 0 || scheduledMinutes > 240) continue; // descarta viradas de dia / dado inconsistente

      const boardingDistance = originDistanceByStopId.get(originStopTime.stopId) ?? 0;
      const alightingDistance = destDistanceByStopId.get(alightingStopTime.stopId) ?? 0;
      const walkMinutes = estimateWalkMinutes(boardingDistance + alightingDistance);
      const delayMinutes = trip.line.status?.status === 'DELAYED' ? trip.line.status.delayMinutes ?? 0 : 0;
      const durationMinutes = Math.max(1, Math.round(scheduledMinutes + walkMinutes + delayMinutes));

      const existing = bestByLine.get(trip.lineId);
      if (existing && existing.durationMinutes <= durationMinutes) continue;

      bestByLine.set(trip.lineId, {
        lineId: trip.lineId,
        lineCode: trip.line.code,
        lineName: trip.line.name,
        boardingStop: {
          id: originStopTime.stop.id,
          name: originStopTime.stop.name,
          distanceMeters: Math.round(boardingDistance),
          latitude: originStopTime.stop.latitude,
          longitude: originStopTime.stop.longitude,
        },
        alightingStop: {
          id: alightingStopTime.stop.id,
          name: alightingStopTime.stop.name,
          distanceMeters: Math.round(alightingDistance),
          latitude: alightingStopTime.stop.latitude,
          longitude: alightingStopTime.stop.longitude,
        },
        stopsCount: alightingStopTime.sequence - originStopTime.sequence,
        durationMinutes,
        // Horário REAL de stop_times.txt - não uma tabela separada de "próximo horário estimado".
        nextDeparture: originStopTime.departureTime.slice(0, 5),
        ...(delayMinutes > 0 ? { delayMinutes } : {}),
        shape: await this.getTripShape(trip.gtfsShapeId),
      });
    }

    return Array.from(bestByLine.values()).sort((a, b) => a.durationMinutes - b.durationMinutes);
  }

  private shapeCache = new Map<string, { latitude: number; longitude: number }[]>();

  private async getTripShape(gtfsShapeId: string | null): Promise<{ latitude: number; longitude: number }[] | undefined> {
    if (!gtfsShapeId) return undefined;
    if (this.shapeCache.has(gtfsShapeId)) return this.shapeCache.get(gtfsShapeId);

    const points = await prisma.transitShape.findMany({
      where: { gtfsShapeId },
      orderBy: { sequence: 'asc' },
      select: { latitude: true, longitude: true },
    });

    if (points.length === 0) return undefined;
    this.shapeCache.set(gtfsShapeId, points);
    return points;
  }

  async searchLines(term: string): Promise<LineSearchResult[]> {
    const lines = await prisma.transitLine.findMany({
      where: {
        dataSource: 'OFFICIAL_GTFS',
        OR: [
          { code: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
        ],
      },
      include: { status: true, _count: { select: { trips: true } } },
      orderBy: { code: 'asc' },
      take: 50, // limite de PAGINAÇÃO da resposta, não da rede carregada
    });

    return lines.map((line) => ({
      lineId: line.id,
      lineCode: line.code,
      lineName: line.name,
      status: (line.status?.status ?? 'OPERATIONAL') as LineSearchResult['status'],
      delayMinutes: line.status?.status === 'DELAYED' ? line.status.delayMinutes ?? null : null,
      hasRouteData: line._count.trips > 0,
      officialSourceUrl: line.officialSourceUrl,
    }));
  }

  async linesNearPoint(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyLine[]> {
    const candidates = await this.nearbyStops(latitude, longitude, radiusMeters);
    if (candidates.length === 0) return [];

    const distanceByStopId = new Map<string, number>(candidates.map((c) => [c.stop.id, c.distanceMeters] as [string, number]));
    const stopTimes = await prisma.transitStopTime.findMany({
      where: { stopId: { in: candidates.map((c) => c.stop.id) }, trip: { line: { dataSource: 'OFFICIAL_GTFS' } } },
      include: {
        stop: true,
        trip: { include: { line: { include: { status: true } }, service: { include: { exceptions: true } } } },
      },
    });

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const byLine = new Map<string, NearbyLine & { _nextMinutes: number | null }>();

    for (const st of stopTimes) {
      const line = st.trip.line;
      if (line.status?.status === 'UNAVAILABLE') continue;
      if (!isServiceValidOn(st.trip.service, now)) continue;

      const distance = distanceByStopId.get(st.stopId) ?? 0;
      const departureMinutes = timeStringToMinutes(st.departureTime);
      const existing = byLine.get(line.id);

      const entry = existing ?? {
        lineId: line.id,
        lineCode: line.code,
        lineName: line.name,
        stop: {
          id: st.stop.id,
          name: st.stop.name,
          distanceMeters: Math.round(distance),
          latitude: st.stop.latitude,
          longitude: st.stop.longitude,
        },
        nextDeparture: null,
        _nextMinutes: null,
      };

      // Mantém a parada mais próxima do usuário para esta linha
      if (existing && distance < existing.stop.distanceMeters) {
        entry.stop = {
          id: st.stop.id,
          name: st.stop.name,
          distanceMeters: Math.round(distance),
          latitude: st.stop.latitude,
          longitude: st.stop.longitude,
        };
      }

      // Próxima partida real (>= agora) entre as viagens que rodam hoje
      if (departureMinutes >= nowMinutes && (entry._nextMinutes === null || departureMinutes < entry._nextMinutes)) {
        entry._nextMinutes = departureMinutes;
        entry.nextDeparture = st.departureTime.slice(0, 5);
      }
      byLine.set(line.id, entry);
    }

    return Array.from(byLine.values())
      .map(({ _nextMinutes, ...rest }) => rest)
      .sort((a, b) => a.stop.distanceMeters - b.stop.distanceMeters);
  }

  async getLineDetail(lineId: string): Promise<LineDetail | null> {
    const line = await prisma.transitLine.findUnique({
      where: { id: lineId },
      include: { status: true },
    });
    if (!line || line.dataSource !== 'OFFICIAL_GTFS') return null;

    // Usa a viagem com mais paradas como representante do trajeto completo
    // da linha (aproximação razoável quando há variantes de trajeto/sentido).
    const trips = await prisma.transitTrip.findMany({
      where: { lineId },
      include: { stopTimes: { include: { stop: true }, orderBy: { sequence: 'asc' } } },
    });

    const representativeTrip = trips.sort((a, b) => b.stopTimes.length - a.stopTimes.length)[0];
    const firstStopTimeMinutes = representativeTrip?.stopTimes[0]
      ? timeStringToMinutes(representativeTrip.stopTimes[0].departureTime)
      : 0;

    return {
      id: line.id,
      code: line.code,
      name: line.name,
      stops: representativeTrip
        ? representativeTrip.stopTimes.map((st) => ({
            sequence: st.sequence,
            // Real, calculado a partir do horário de partida de cada parada
            // nesta viagem (stop_times.txt) - não é uma estimativa.
            minutesFromStart: timeStringToMinutes(st.departureTime) - firstStopTimeMinutes,
            stop: { id: st.stop.id, name: st.stop.name, latitude: st.stop.latitude, longitude: st.stop.longitude, stopCode: st.stop.stopCode },
          }))
        : [],
      shape: await this.getTripShape(representativeTrip?.gtfsShapeId ?? null),
      status: (line.status?.status ?? 'OPERATIONAL') as LineDetail['status'],
      delayMinutes: line.status?.status === 'DELAYED' ? line.status.delayMinutes ?? null : null,
      statusReason: line.status?.reason ?? null,
      hasRouteData: trips.length > 0,
      officialSourceUrl: line.officialSourceUrl,
    };
  }
}

interface ServiceCalendar {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: Date;
  endDate: Date;
  exceptions: { date: Date; exceptionType: number }[];
}

/** GTFS calendar.txt + calendar_dates.txt: a viagem roda na data informada? */
function isServiceValidOn(service: ServiceCalendar, date: Date): boolean {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const exception = service.exceptions.find((e) => sameDay(e.date, date));
  if (exception) return exception.exceptionType === 1; // 1 = adicionado, 2 = removido

  if (date < service.startDate || date > service.endDate) return false;

  const weekdayFlags = [service.sunday, service.monday, service.tuesday, service.wednesday, service.thursday, service.friday, service.saturday];
  return weekdayFlags[date.getDay()];
}

/** GTFS permite "25:30:00" para viagens após meia-noite - converte para minutos totais desde 00:00. */
function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
