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
const MAX_NEARBY_STOPS = 8;
const MAX_ROUTE_OPTIONS = 5;
const SHAPE_CACHE_MAX = 24;

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

/**
 * Provider oficial do GuiaMobi.
 *
 * O identificador interno da linha é o TransitLine.id, que é relacionado
 * univocamente ao routes.txt por gtfsRouteId. route_short_name é apenas o
 * código exibido ao usuário e pode se repetir no feed.
 */
export class GtfsDatabaseProvider implements TransitProvider {
  readonly name = 'official-gtfs' as const;

  private readonly shapeCache = new Map<string, { latitude: number; longitude: number }[]>();

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
      importedAt: latest?.createdAt.toISOString() ?? null,
      provider: 'official-gtfs',
    };
  }

  private async nearbyStops(latitude: number, longitude: number, radiusMeters: number) {
    const { deltaLat, deltaLon } = boundingBoxDeltas(latitude, radiusMeters);
    const candidates = await prisma.transitStop.findMany({
      where: {
        gtfsStopId: { not: null },
        latitude: { gte: latitude - deltaLat, lte: latitude + deltaLat },
        longitude: { gte: longitude - deltaLon, lte: longitude + deltaLon },
      },
      select: { id: true, name: true, latitude: true, longitude: true, stopCode: true },
    });

    return candidates
      .map((stop) => ({ stop, distanceMeters: haversineDistanceMeters(latitude, longitude, stop.latitude, stop.longitude) }))
      .filter((candidate) => candidate.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, MAX_NEARBY_STOPS);
  }

  async searchRoutes(query: SearchRoutesQueryInput): Promise<RouteOption[]> {
    const [originCandidates, destinationCandidates] = await Promise.all([
      this.nearbyStops(query.originLat, query.originLng, MAX_WALK_DISTANCE_METERS),
      this.nearbyStops(query.destinationLat, query.destinationLng, MAX_WALK_DISTANCE_METERS),
    ]);

    if (originCandidates.length === 0 || destinationCandidates.length === 0) return [];

    const originStopIds = originCandidates.map((candidate) => candidate.stop.id);
    const destinationStopIds = destinationCandidates.map((candidate) => candidate.stop.id);
    const originDistanceByStopId = new Map(originCandidates.map((candidate) => [candidate.stop.id, candidate.distanceMeters]));
    const destinationDistanceByStopId = new Map(destinationCandidates.map((candidate) => [candidate.stop.id, candidate.distanceMeters]));

    const now = new Date();
    const nowMinutes = getCurrentMinutesSaoPaulo(now);
    const currentGtfsTime = getCurrentGtfsTimeSaoPaulo(now);
    const validServiceIds = await getValidServiceIdsOn(now);

    if (validServiceIds.length === 0) return [];

    // O filtro de calendário e de horário acontece no PostgreSQL, antes dos
    // registros saírem do banco. Isso evita carregar milhares de stop_times
    // já passados ou pertencentes a serviços que não operam hoje.
    const originStopTimes = await prisma.transitStopTime.findMany({
      where: {
        stopId: { in: originStopIds },
        departureTime: { gte: currentGtfsTime },
        trip: {
          serviceId: { in: validServiceIds },
          line: { dataSource: 'OFFICIAL_GTFS' },
        },
      },
      select: {
        tripId: true,
        stopId: true,
        sequence: true,
        departureTime: true,
        stop: { select: { id: true, name: true, latitude: true, longitude: true } },
        trip: {
          select: {
            lineId: true,
            gtfsShapeId: true,
            line: { select: { id: true, code: true, name: true, status: true } },
          },
        },
      },
      orderBy: { departureTime: 'asc' },
    });

    const futureOriginStopTimes = originStopTimes.filter((origin) =>
      timeStringToMinutes(origin.departureTime) >= nowMinutes
    );

    if (futureOriginStopTimes.length === 0) return [];

    const tripIds = Array.from(new Set(futureOriginStopTimes.map((item) => item.tripId)));
    const destinationStopTimes = await prisma.transitStopTime.findMany({
      where: {
        tripId: { in: tripIds },
        stopId: { in: destinationStopIds },
      },
      select: {
        tripId: true,
        stopId: true,
        sequence: true,
        arrivalTime: true,
        departureTime: true,
        stop: { select: { id: true, name: true, latitude: true, longitude: true } },
      },
    });

    const destinationsByTrip = new Map<string, typeof destinationStopTimes>();
    for (const destination of destinationStopTimes) {
      const list = destinationsByTrip.get(destination.tripId);
      if (list) list.push(destination);
      else destinationsByTrip.set(destination.tripId, [destination]);
    }

    type Candidate = {
      option: RouteOption;
      tripId: string;
      shapeId: string | null;
      arrivalMinutes: number;
      departureMinutes: number;
    };

    // Uma opção por gtfs route_id. Isso evita assumir que route_short_name
    // seja único (o feed oficial possui pelo menos um código repetido).
    const bestByRouteId = new Map<string, Candidate>();

    for (const origin of futureOriginStopTimes) {
      const line = origin.trip.line;
      if (line.status?.status === 'UNAVAILABLE') continue;

      const destinations = (destinationsByTrip.get(origin.tripId) ?? [])
        .filter((destination) => destination.sequence > origin.sequence)
        .sort((a, b) => a.sequence - b.sequence);
      if (destinations.length === 0) continue;

      const destination = destinations[0];
      const departureMinutes = timeStringToMinutes(origin.departureTime);
      const arrivalMinutes = timeStringToMinutes(destination.arrivalTime);
      const scheduledMinutes = arrivalMinutes - departureMinutes;
      if (scheduledMinutes <= 0 || scheduledMinutes > 240) continue;

      const boardingDistance = originDistanceByStopId.get(origin.stopId) ?? Infinity;
      const alightingDistance = destinationDistanceByStopId.get(destination.stopId) ?? Infinity;
      const walkMinutes = estimateWalkMinutes(boardingDistance + alightingDistance);
      const waitMinutes = Math.max(0, departureMinutes - nowMinutes);
      const delayMinutes = line.status?.status === 'DELAYED' ? line.status.delayMinutes ?? 0 : 0;
      const durationMinutes = Math.max(1, Math.round(waitMinutes + scheduledMinutes + walkMinutes + delayMinutes));

      const option: RouteOption = {
        lineId: line.id,
        lineCode: line.code,
        lineName: line.name,
        boardingStop: {
          id: origin.stop.id,
          name: origin.stop.name,
          distanceMeters: Math.round(boardingDistance),
          latitude: origin.stop.latitude,
          longitude: origin.stop.longitude,
        },
        alightingStop: {
          id: destination.stop.id,
          name: destination.stop.name,
          distanceMeters: Math.round(alightingDistance),
          latitude: destination.stop.latitude,
          longitude: destination.stop.longitude,
        },
        stopsCount: destination.sequence - origin.sequence,
        durationMinutes,
        nextDeparture: origin.departureTime.slice(0, 5),
        ...(delayMinutes > 0 ? { delayMinutes } : {}),
      };

      const candidate: Candidate = {
        option,
        tripId: origin.tripId,
        shapeId: origin.trip.gtfsShapeId,
        arrivalMinutes,
        departureMinutes,
      };
      const existing = bestByRouteId.get(line.id);
      if (!existing || candidate.arrivalMinutes < existing.arrivalMinutes ||
          (candidate.arrivalMinutes === existing.arrivalMinutes && candidate.departureMinutes < existing.departureMinutes)) {
        bestByRouteId.set(line.id, candidate);
      }
    }

    const best = Array.from(bestByRouteId.values())
      .sort((a, b) => a.option.durationMinutes - b.option.durationMinutes)
      .slice(0, MAX_ROUTE_OPTIONS);

    const enriched = await Promise.all(best.map(async (candidate) => {
      const [shape, stops] = await Promise.all([
        this.getTripShape(candidate.shapeId),
        this.getTripStops(candidate.tripId),
      ]);
      return { ...candidate.option, shape, stops };
    }));

    return enriched;
  }

  private async getTripStops(tripId: string): Promise<LineDetail['stops']> {
    const stopTimes = await prisma.transitStopTime.findMany({
      where: { tripId },
      orderBy: { sequence: 'asc' },
      select: {
        sequence: true,
        departureTime: true,
        arrivalTime: true,
        stop: { select: { id: true, name: true, latitude: true, longitude: true, stopCode: true } },
      },
    });

    if (stopTimes.length === 0) return [];
    const firstMinutes = timeStringToMinutes(stopTimes[0].departureTime || stopTimes[0].arrivalTime);
    return stopTimes.map((stopTime) => ({
      sequence: stopTime.sequence,
      minutesFromStart: Math.max(0, timeStringToMinutes(stopTime.departureTime || stopTime.arrivalTime) - firstMinutes),
      stop: {
        id: stopTime.stop.id,
        name: stopTime.stop.name,
        latitude: stopTime.stop.latitude,
        longitude: stopTime.stop.longitude,
        stopCode: stopTime.stop.stopCode,
      },
    }));
  }

  private async getTripShape(gtfsShapeId: string | null): Promise<{ latitude: number; longitude: number }[] | undefined> {
    if (!gtfsShapeId) return undefined;
    const cached = this.shapeCache.get(gtfsShapeId);
    if (cached) return cached;

    const points = await prisma.transitShape.findMany({
      where: { gtfsShapeId },
      orderBy: { sequence: 'asc' },
      select: { latitude: true, longitude: true },
    });
    if (points.length === 0) return undefined;

    if (this.shapeCache.size >= SHAPE_CACHE_MAX) {
      const oldest = this.shapeCache.keys().next().value;
      if (oldest) this.shapeCache.delete(oldest);
    }
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
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      take: 50,
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

    const distanceByStopId = new Map(candidates.map((candidate) => [candidate.stop.id, candidate.distanceMeters]));
    const now = new Date();
    const nowMinutes = getCurrentMinutesSaoPaulo(now);

    const currentGtfsTime = getCurrentGtfsTimeSaoPaulo(now);
    const validServiceIds = await getValidServiceIdsOn(now);
    if (validServiceIds.length === 0) return [];

    const stopTimes = await prisma.transitStopTime.findMany({
      where: {
        stopId: { in: candidates.map((candidate) => candidate.stop.id) },
        departureTime: { gte: currentGtfsTime },
        trip: {
          serviceId: { in: validServiceIds },
          line: { dataSource: 'OFFICIAL_GTFS' },
        },
      },
      select: {
        stopId: true,
        departureTime: true,
        trip: {
          select: {
            line: { select: { id: true, code: true, name: true, status: true } },
          },
        },
        stop: { select: { id: true, name: true, latitude: true, longitude: true } },
      },
      orderBy: { departureTime: 'asc' },
    });

    const byLine = new Map<string, NearbyLine & { nextMinutes: number | null }>();
    for (const stopTime of stopTimes) {
      const departureMinutes = timeStringToMinutes(stopTime.departureTime);
      if (departureMinutes < nowMinutes) continue;
      if (stopTime.trip.line.status?.status === 'UNAVAILABLE') continue;

      const distance = distanceByStopId.get(stopTime.stopId) ?? Infinity;
      const existing = byLine.get(stopTime.trip.line.id);
      const nextMinutes = existing?.nextMinutes ?? null;
      const isEarlier = nextMinutes === null || departureMinutes < nextMinutes;

      if (!existing) {
        byLine.set(stopTime.trip.line.id, {
          lineId: stopTime.trip.line.id,
          lineCode: stopTime.trip.line.code,
          lineName: stopTime.trip.line.name,
          stop: {
            id: stopTime.stop.id,
            name: stopTime.stop.name,
            distanceMeters: Math.round(distance),
            latitude: stopTime.stop.latitude,
            longitude: stopTime.stop.longitude,
          },
          nextDeparture: stopTime.departureTime.slice(0, 5),
          nextMinutes: departureMinutes,
        });
        continue;
      }

      if (distance < existing.stop.distanceMeters) {
        existing.stop = {
          id: stopTime.stop.id,
          name: stopTime.stop.name,
          distanceMeters: Math.round(distance),
          latitude: stopTime.stop.latitude,
          longitude: stopTime.stop.longitude,
        };
      }
      if (isEarlier) {
        existing.nextMinutes = departureMinutes;
        existing.nextDeparture = stopTime.departureTime.slice(0, 5);
      }
    }

    return Array.from(byLine.values())
      .map(({ nextMinutes: _nextMinutes, ...line }) => line)
      .sort((a, b) => a.stop.distanceMeters - b.stop.distanceMeters);
  }

  async getLineDetail(lineId: string): Promise<LineDetail | null> {
    const line = await prisma.transitLine.findFirst({
      where: { id: lineId, dataSource: 'OFFICIAL_GTFS' },
      include: { status: true },
    });
    if (!line) return null;

    // Uma única viagem representativa evita carregar todas as viagens da linha.
    // A busca de rota usa a trip exata selecionada para a viagem do usuário.
    const representativeTrip = await prisma.transitTrip.findFirst({
      where: { lineId },
      orderBy: { id: 'asc' },
      select: { id: true, gtfsShapeId: true },
    });

    const stops = representativeTrip ? await this.getTripStops(representativeTrip.id) : [];

    return {
      id: line.id,
      code: line.code,
      name: line.name,
      stops,
      shape: await this.getTripShape(representativeTrip?.gtfsShapeId ?? null),
      status: (line.status?.status ?? 'OPERATIONAL') as LineDetail['status'],
      delayMinutes: line.status?.status === 'DELAYED' ? line.status.delayMinutes ?? null : null,
      statusReason: line.status?.reason ?? null,
      hasRouteData: Boolean(representativeTrip),
      officialSourceUrl: line.officialSourceUrl,
    };
  }
}

function getCurrentMinutesSaoPaulo(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function localDateKeySaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
}

async function getValidServiceIdsOn(date: Date): Promise<string[]> {
  const dateKey = localDateKeySaoPaulo(date);
  const weekday = new Date(`${dateKey}T12:00:00-03:00`).getDay();
  const weekdayWhere = [
    { sunday: true },
    { monday: true },
    { tuesday: true },
    { wednesday: true },
    { thursday: true },
    { friday: true },
    { saturday: true },
  ][weekday];

  const dateStart = new Date(`${dateKey}T00:00:00-03:00`);
  const dateEnd = new Date(`${dateKey}T23:59:59.999-03:00`);

  const services = await prisma.transitService.findMany({
    where: {
      startDate: { lte: dateEnd },
      endDate: { gte: dateStart },
      ...weekdayWhere,
    },
    select: { id: true },
  });

  const baseIds = services.map((service) => service.id);
  const exceptions = await prisma.transitCalendarException.findMany({
    where: { date: { gte: dateStart, lte: dateEnd } },
    select: { serviceId: true, exceptionType: true },
  });

  const removed = new Set(
    exceptions.filter((item) => item.exceptionType === 2).map((item) => item.serviceId)
  );
  const activeSet = new Set(baseIds.filter((id) => !removed.has(id)));

  // Também cobre service_id que existe apenas em calendar_dates.txt.
  for (const exception of exceptions) {
    if (exception.exceptionType === 1) activeSet.add(exception.serviceId);
  }

  return Array.from(activeSet);
}

function getCurrentGtfsTimeSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

/** GTFS permite horários como 25:30:00 após a meia-noite. */
function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
