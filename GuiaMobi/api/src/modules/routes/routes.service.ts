import { prisma } from '../../database/prisma';
import { SearchRoutesQuery } from './routes.schema';
import { env } from '../../config/env';

// Distância máxima (em metros) que consideramos "caminhável" até uma parada
const MAX_WALK_DISTANCE_METERS = 1200;
// Velocidade média assumida do ônibus entre paradas (km/h), usada apenas
// como estimativa quando não há um horário real cadastrado
const AVERAGE_SPEED_KMH = 20;

export interface RouteOption {
  lineId: string;
  lineCode: string;
  lineName: string;
  boardingStop: { id: string; name: string; distanceMeters: number };
  alightingStop: { id: string; name: string; distanceMeters: number };
  stopsCount: number;
  durationMinutes: number;
}

export const routesService = {
  /**
   * Resume os dados de transporte carregados (quantas linhas e paradas, de
   * que fonte e desde quando), para o app informar a situação real.
   */
  async getStatus() {
    const [linesCount, stopsCount, latest] = await Promise.all([
      prisma.transitLine.count(),
      prisma.transitStop.count(),
      prisma.transitLine.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);

    return {
      hasData: linesCount > 0 && stopsCount > 0,
      source: linesCount > 0 ? env.TRANSIT_DATA_SOURCE : null,
      linesCount,
      stopsCount,
      importedAt: latest ? latest.createdAt.toISOString() : null,
    };
  },

  /**
   * Busca linhas de ônibus que atendem ao par origem/destino informado.
   *
   * Algoritmo (real, não simulado):
   * 1. Para cada linha cadastrada, localiza a parada mais próxima da origem
   *    e a mais próxima do destino (dentro do raio caminhável).
   * 2. Descarta a linha se a parada de embarque não vier ANTES da parada de
   *    desembarque na sequência do trajeto (evita sugerir o sentido errado).
   * 3. Estima a duração pela diferença de tempo cadastrada entre as paradas
   *    (minutesFromStart), somando uma margem de caminhada.
   * 4. Ordena as opções pela duração total (mais rápida primeiro).
   */
  async searchRoutes(query: SearchRoutesQuery): Promise<RouteOption[]> {
    const lines = await prisma.transitLine.findMany({
      include: {
        stops: {
          include: { stop: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    const options: RouteOption[] = [];

    for (const line of lines) {
      const boarding = findNearestStop(line.stops, query.originLat, query.originLng);
      const alighting = findNearestStop(line.stops, query.destinationLat, query.destinationLng);

      if (!boarding || !alighting) continue;
      if (boarding.distanceMeters > MAX_WALK_DISTANCE_METERS) continue;
      if (alighting.distanceMeters > MAX_WALK_DISTANCE_METERS) continue;
      // Garante o sentido correto: embarque precisa vir antes do desembarque
      if (boarding.lineStop.sequence >= alighting.lineStop.sequence) continue;

      const travelMinutes = alighting.lineStop.minutesFromStart - boarding.lineStop.minutesFromStart;
      const walkMinutes = estimateWalkMinutes(boarding.distanceMeters + alighting.distanceMeters);
      const stopsCount = alighting.lineStop.sequence - boarding.lineStop.sequence;

      options.push({
        lineId: line.id,
        lineCode: line.code,
        lineName: line.name,
        boardingStop: {
          id: boarding.lineStop.stop.id,
          name: boarding.lineStop.stop.name,
          distanceMeters: Math.round(boarding.distanceMeters),
        },
        alightingStop: {
          id: alighting.lineStop.stop.id,
          name: alighting.lineStop.stop.name,
          distanceMeters: Math.round(alighting.distanceMeters),
        },
        stopsCount,
        durationMinutes: Math.max(1, Math.round(travelMinutes + walkMinutes)),
      });
    }

    return options.sort((a, b) => a.durationMinutes - b.durationMinutes);
  },

  /**
   * Detalhe de uma linha (usado na tela de detalhes/acompanhamento da rota).
   */
  async getLineDetail(lineId: string) {
    return prisma.transitLine.findUnique({
      where: { id: lineId },
      include: {
        stops: {
          include: { stop: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });
  },
};

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
    const distanceMeters = haversineDistanceMeters(
      latitude,
      longitude,
      lineStop.stop.latitude,
      lineStop.stop.longitude
    );

    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { lineStop, distanceMeters };
    }
  }

  return nearest;
}

/** Distância em metros entre duas coordenadas (fórmula de Haversine). */
function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function estimateWalkMinutes(distanceMeters: number): number {
  const walkSpeedMetersPerMinute = 80; // ~4,8 km/h
  return distanceMeters / walkSpeedMetersPerMinute;
}

// Mantido para possível uso futuro (ex.: exibir velocidade média na UI)
export const AVERAGE_SPEED_KMH_CONST = AVERAGE_SPEED_KMH;
