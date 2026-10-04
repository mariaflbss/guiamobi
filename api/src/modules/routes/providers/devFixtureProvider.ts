import { prisma } from '../../../database/prisma';
import { env } from '../../../config/env';
import { TransitDayType } from '@prisma/client';
import { haversineDistanceMeters, estimateWalkMinutes } from './geoUtils';
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
 * Provider de DESENVOLVIMENTO: lê o catálogo de 100 linhas oficiais
 * (nome/código, copiados da página da Prefeitura de SJC) e o trajeto
 * baseado nos PDFs oficiais de 5 delas (ver api/prisma/seed/realLineRoutes.ts).
 *
 * ISSO NÃO É A REDE COMPLETA DE SÃO JOSÉ DOS CAMPOS. Serve só para provar
 * localmente que a busca de rotas, a ordenação por duração e a busca por
 * número/nome funcionam de ponta a ponta com horários publicados e coordenadas de referência,
 * enquanto o feed GTFS oficial não está acessível (ver README de
 * api/src/integrations/transit/). Nunca é escolhido automaticamente se
 * houver dado OFFICIAL_GTFS carregado - ver providers/index.ts.
 */
export class DevFixtureProvider implements TransitProvider {
  readonly name = 'dev-fixture' as const;

  private officialDataFilter() {
    return {
      dataSource: 'DEV_FIXTURE' as const,
      ...(env.ALLOW_DEMO_TRANSIT_DATA ? {} : { isOfficialData: true }),
    };
  }

  async getStatus(): Promise<TransitStatus> {
    const [linesCount, linesWithRouteDataCount, stopsCount, latest] = await Promise.all([
      prisma.transitLine.count({ where: this.officialDataFilter() }),
      prisma.transitLine.count({ where: { ...this.officialDataFilter(), stops: { some: {} } } }),
      prisma.transitStop.count(),
      prisma.transitLine.findFirst({
        where: this.officialDataFilter(),
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      hasData: linesWithRouteDataCount > 0,
      linesCount,
      linesWithRouteDataCount,
      source: linesCount > 0 ? env.TRANSIT_DATA_SOURCE : null,
      stopsCount,
      importedAt: latest ? latest.createdAt.toISOString() : null,
      provider: 'dev-fixture',
    };
  }

  async searchRoutes(query: SearchRoutesQueryInput): Promise<RouteOption[]> {
    const lines = await prisma.transitLine.findMany({
      where: this.officialDataFilter(),
      include: {
        stops: { include: { stop: true }, orderBy: { sequence: 'asc' } },
        status: true,
      },
    });

    const now = new Date();
    const options: RouteOption[] = [];

    for (const line of lines) {
      const effectiveStatus = getMockStatus(line.code, line.status?.status);
      if (effectiveStatus === 'UNAVAILABLE') continue;

      const boarding = findNearestStop(line.stops, query.originLat, query.originLng);
      const alighting = boarding
        ? findNearestStopAfterSequence(line.stops, query.destinationLat, query.destinationLng, boarding.lineStop.sequence)
        : null;

      if (!boarding || !alighting) continue;
      if (boarding.distanceMeters > MAX_WALK_DISTANCE_METERS) continue;
      if (alighting.distanceMeters > MAX_WALK_DISTANCE_METERS) continue;
      if (boarding.lineStop.sequence >= alighting.lineStop.sequence) continue;

      const travelMinutes = alighting.lineStop.minutesFromStart - boarding.lineStop.minutesFromStart;
      const walkMinutes = estimateWalkMinutes(boarding.distanceMeters + alighting.distanceMeters);
      const stopsCount = alighting.lineStop.sequence - boarding.lineStop.sequence;
      const delayMinutes = effectiveStatus === 'DELAYED' ? (line.status?.delayMinutes ?? 5) : 0;

      options.push({
        lineId: line.id,
        lineCode: line.code,
        lineName: line.name,
        boardingStop: {
          id: boarding.lineStop.stop.id,
          name: boarding.lineStop.stop.name,
          distanceMeters: Math.round(boarding.distanceMeters),
          latitude: boarding.lineStop.stop.latitude,
          longitude: boarding.lineStop.stop.longitude,
        },
        alightingStop: {
          id: alighting.lineStop.stop.id,
          name: alighting.lineStop.stop.name,
          distanceMeters: Math.round(alighting.distanceMeters),
          latitude: alighting.lineStop.stop.latitude,
          longitude: alighting.lineStop.stop.longitude,
        },
        stopsCount,
        durationMinutes: Math.max(1, Math.round(travelMinutes + walkMinutes + delayMinutes)),
        nextDeparture: await findNextDeparture(line.id, now),
        ...(delayMinutes > 0 ? { delayMinutes } : {}),
      });
    }

    return options.sort((a, b) => a.durationMinutes - b.durationMinutes);
  }

  async searchLines(term: string): Promise<LineSearchResult[]> {
    const lines = await prisma.transitLine.findMany({
      where: {
        AND: [
          this.officialDataFilter(),
          {
            OR: [
              { code: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: { status: true, _count: { select: { stops: true } } },
      orderBy: { code: 'asc' },
      take: 20,
    });

    return lines.map((line) => ({
      lineId: line.id,
      lineCode: line.code,
      lineName: line.name,
      status: getMockStatus(line.code, line.status?.status) as LineSearchResult['status'],
      delayMinutes: getMockStatus(line.code, line.status?.status) === 'DELAYED' ? (line.status?.delayMinutes ?? 5) : null,
      hasRouteData: line._count.stops > 0,
      officialSourceUrl: line.officialSourceUrl,
    }));
  }

  async linesNearPoint(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyLine[]> {
    const lines = await prisma.transitLine.findMany({
      where: this.officialDataFilter(),
      include: { stops: { include: { stop: true }, orderBy: { sequence: 'asc' } }, status: true },
    });

    const now = new Date();
    const result: NearbyLine[] = [];
    for (const line of lines) {
      const effectiveStatus = getMockStatus(line.code, line.status?.status);
      if (effectiveStatus === 'UNAVAILABLE') continue;
      const nearest = findNearestStop(line.stops, latitude, longitude);
      if (!nearest || nearest.distanceMeters > radiusMeters) continue;
      result.push({
        lineId: line.id,
        lineCode: line.code,
        lineName: line.name,
        stop: {
          id: nearest.lineStop.stop.id,
          name: nearest.lineStop.stop.name,
          distanceMeters: Math.round(nearest.distanceMeters),
          latitude: nearest.lineStop.stop.latitude,
          longitude: nearest.lineStop.stop.longitude,
        },
        nextDeparture: await findNextDeparture(line.id, now),
      });
    }
    return result.sort((a, b) => a.stop.distanceMeters - b.stop.distanceMeters);
  }

  async getLineDetail(lineId: string): Promise<LineDetail | null> {
    const line = await prisma.transitLine.findUnique({
      where: { id: lineId },
      include: {
        stops: { include: { stop: true }, orderBy: { sequence: 'asc' } },
        status: true,
      },
    });

    if (!line) return null;

    return {
      id: line.id,
      code: line.code,
      name: line.name,
      stops: line.stops.map((s) => ({
        sequence: s.sequence,
        minutesFromStart: s.minutesFromStart,
        stop: { id: s.stop.id, name: s.stop.name, latitude: s.stop.latitude, longitude: s.stop.longitude },
      })),
      status: getMockStatus(line.code, line.status?.status) as LineDetail['status'],
      delayMinutes: getMockStatus(line.code, line.status?.status) === 'DELAYED' ? (line.status?.delayMinutes ?? 5) : null,
      statusReason: line.status?.reason ?? null,
      hasRouteData: line.stops.length > 0,
      officialSourceUrl: line.officialSourceUrl,
    };
  }
}

function currentDayType(now: Date): TransitDayType {
  const day = now.getDay();
  if (day === 0) return TransitDayType.SUNDAY_HOLIDAY;
  if (day === 6) return TransitDayType.SATURDAY;
  return TransitDayType.WEEKDAY;
}

async function findNextDeparture(lineId: string, now: Date): Promise<string | null> {
  const dayType = currentDayType(now);
  const nowLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const departures = await prisma.transitDeparture.findMany({
    where: { lineId, dayType },
    orderBy: { departureTime: 'asc' },
  });

  if (departures.length === 0) return null;

  const next = departures.find((d) => d.departureTime >= nowLabel);
  return next ? next.departureTime : departures[0].departureTime;
}

function findNearestStopAfterSequence(
  lineStops: LineStopWithStop[],
  latitude: number,
  longitude: number,
  minimumSequence: number
): { lineStop: LineStopWithStop; distanceMeters: number } | null {
  let nearest: { lineStop: LineStopWithStop; distanceMeters: number } | null = null;

  for (const lineStop of lineStops) {
    if (lineStop.sequence <= minimumSequence) continue;
    const distanceMeters = haversineDistanceMeters(latitude, longitude, lineStop.stop.latitude, lineStop.stop.longitude);
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { lineStop, distanceMeters };
    }
  }

  return nearest;
}

function getMockStatus(lineCode: string, databaseStatus?: string | null): 'OPERATIONAL' | 'DELAYED' | 'UNAVAILABLE' {
  const scenario = env.MOCK_TRANSIT_SCENARIO;
  if (scenario === `delayed-${lineCode}`) return 'DELAYED';
  if (scenario === `unavailable-${lineCode}`) return 'UNAVAILABLE';
  return (databaseStatus ?? 'OPERATIONAL') as 'OPERATIONAL' | 'DELAYED' | 'UNAVAILABLE';
}

interface LineStopWithStop {
  sequence: number;
  minutesFromStart: number;
  stop: { id: string; name: string; latitude: number; longitude: number };
}

function findNearestStop(
  lineStops: LineStopWithStop[],
  latitude: number,
  longitude: number
): { lineStop: LineStopWithStop; distanceMeters: number } | null {
  let nearest: { lineStop: LineStopWithStop; distanceMeters: number } | null = null;

  for (const lineStop of lineStops) {
    const distanceMeters = haversineDistanceMeters(latitude, longitude, lineStop.stop.latitude, lineStop.stop.longitude);
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { lineStop, distanceMeters };
    }
  }

  return nearest;
}
