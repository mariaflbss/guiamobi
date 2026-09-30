/**
 * Importador de um feed GTFS estático completo (agency, routes, stops,
 * trips, stop_times, calendar, calendar_dates, shapes) para o banco do
 * GuiaMobi, marcando tudo como dataSource = OFFICIAL_GTFS.
 *
 * Uso:
 *   npm run import:gtfs -- ./caminho/para/feed.zip
 *   npm run import:gtfs -- https://exemplo.com/gtfs.zip
 *
 * Sem limite artificial de quantidade: processa TODAS as linhas do feed,
 * sejam 3 ou 3000. calendar_dates.txt e shapes.txt são opcionais (nem todo
 * feed GTFS os inclui) - quando ausentes, são simplesmente ignorados, sem
 * inventar nada no lugar.
 *
 * Reexecução: é seguro rodar de novo com um feed atualizado - agências,
 * linhas e paradas são atualizadas em vigor (upsert pelo id do GTFS); os
 * dados "de detalhe" (viagens, horários por parada, calendário, shapes) são
 * substituídos por completo a cada importação, como é o padrão para uma
 * publicação nova de um feed GTFS inteiro.
 */
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  GtfsAgencyRow,
  GtfsCalendarDateRow,
  GtfsCalendarRow,
  GtfsRouteRow,
  GtfsShapeRow,
  GtfsStopRow,
  GtfsStopTimeRow,
  GtfsTripRow,
  parseGtfsDate,
} from './gtfsTypes';

const prisma = new PrismaClient();
const BATCH_SIZE = 2000;

async function loadZip(source: string): Promise<AdmZip> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    console.log(`Baixando feed de ${source}...`);
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Falha ao baixar o feed GTFS: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return new AdmZip(buffer);
  }
  return new AdmZip(source);
}

function readCsv<T>(zip: AdmZip, fileName: string): T[] {
  const entry = zip.getEntry(fileName);
  if (!entry) return [];
  const content = entry.getData().toString('utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true }) as T[];
}

async function chunked<T>(items: T[], fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    await fn(items.slice(i, i + BATCH_SIZE));
  }
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('Uso: npm run import:gtfs -- <caminho-ou-url-do-feed.zip>');
    process.exit(1);
  }

  const zip = await loadZip(source);

  const agencies = readCsv<GtfsAgencyRow>(zip, 'agency.txt');
  const routes = readCsv<GtfsRouteRow>(zip, 'routes.txt');
  const stops = readCsv<GtfsStopRow>(zip, 'stops.txt');
  const trips = readCsv<GtfsTripRow>(zip, 'trips.txt');
  const stopTimes = readCsv<GtfsStopTimeRow>(zip, 'stop_times.txt');
  const calendar = readCsv<GtfsCalendarRow>(zip, 'calendar.txt');
  const calendarDates = readCsv<GtfsCalendarDateRow>(zip, 'calendar_dates.txt'); // opcional
  const shapes = readCsv<GtfsShapeRow>(zip, 'shapes.txt'); // opcional

  console.log(
    `Feed lido: ${agencies.length} agências, ${routes.length} linhas, ${stops.length} paradas, ` +
      `${trips.length} viagens, ${stopTimes.length} horários, ${calendar.length} calendários, ` +
      `${calendarDates.length} exceções de calendário, ${shapes.length} pontos de shape.`
  );

  if (routes.length === 0 || stops.length === 0 || trips.length === 0 || stopTimes.length === 0) {
    throw new Error(
      'Feed incompleto: routes.txt, stops.txt, trips.txt e stop_times.txt são obrigatórios para a busca de rotas funcionar.'
    );
  }

  // ----- 1) Agências (upsert - dimensão pequena) -----
  const agencyIdByGtfsId = new Map<string, string>();
  const agencyRows = agencies.length > 0 ? agencies : [{ agency_name: 'Operador não identificado no feed' }];
  for (const a of agencyRows) {
    const gtfsId = a.agency_id || 'default';
    const record = await prisma.transitAgency.upsert({
      where: { gtfsId },
      update: { name: a.agency_name, url: a.agency_url, timezone: a.agency_timezone },
      create: { gtfsId, name: a.agency_name, url: a.agency_url, timezone: a.agency_timezone },
    });
    agencyIdByGtfsId.set(gtfsId, record.id);
  }
  const fallbackAgencyId = agencyIdByGtfsId.values().next().value as string;

  // ----- 2) Linhas/rotas (upsert) -----
  const lineIdByGtfsRouteId = new Map<string, string>();
  console.log(`Importando ${routes.length} linhas...`);
  for (const r of routes) {
    const code = r.route_short_name || r.route_id;
    const name = r.route_long_name || r.route_short_name || r.route_id;
    const agencyId = r.agency_id ? agencyIdByGtfsId.get(r.agency_id) ?? fallbackAgencyId : fallbackAgencyId;

    const record = await prisma.transitLine.upsert({
      where: { gtfsRouteId: r.route_id },
      update: {
        code,
        name,
        dataSource: 'OFFICIAL_GTFS',
        routeType: r.route_type ? Number(r.route_type) : null,
        agencyId,
      },
      create: {
        gtfsRouteId: r.route_id,
        code,
        name,
        dataSource: 'OFFICIAL_GTFS',
        isOfficialData: true,
        routeType: r.route_type ? Number(r.route_type) : null,
        agencyId,
      },
    });
    lineIdByGtfsRouteId.set(r.route_id, record.id);
  }

  // ----- 3) Paradas (upsert) -----
  const stopIdByGtfsStopId = new Map<string, string>();
  console.log(`Importando ${stops.length} paradas...`);
  for (const s of stops) {
    const latitude = Number(s.stop_lat);
    const longitude = Number(s.stop_lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue; // nunca inventar coordenada para uma linha malformada

    const record = await prisma.transitStop.upsert({
      where: { gtfsStopId: s.stop_id },
      update: { name: s.stop_name, latitude, longitude, stopCode: s.stop_code },
      create: { gtfsStopId: s.stop_id, name: s.stop_name, latitude, longitude, stopCode: s.stop_code },
    });
    stopIdByGtfsStopId.set(s.stop_id, record.id);
  }

  // ----- 4) Calendário (replace completo, escopo = serviços deste feed) -----
  console.log(`Importando ${calendar.length} calendários (calendar.txt)...`);
  const serviceIdByGtfsServiceId = new Map<string, string>();
  for (const c of calendar) {
    const record = await prisma.transitService.upsert({
      where: { gtfsServiceId: c.service_id },
      update: {
        monday: c.monday === '1',
        tuesday: c.tuesday === '1',
        wednesday: c.wednesday === '1',
        thursday: c.thursday === '1',
        friday: c.friday === '1',
        saturday: c.saturday === '1',
        sunday: c.sunday === '1',
        startDate: parseGtfsDate(c.start_date),
        endDate: parseGtfsDate(c.end_date),
      },
      create: {
        gtfsServiceId: c.service_id,
        monday: c.monday === '1',
        tuesday: c.tuesday === '1',
        wednesday: c.wednesday === '1',
        thursday: c.thursday === '1',
        friday: c.friday === '1',
        saturday: c.saturday === '1',
        sunday: c.sunday === '1',
        startDate: parseGtfsDate(c.start_date),
        endDate: parseGtfsDate(c.end_date),
      },
    });
    serviceIdByGtfsServiceId.set(c.service_id, record.id);
  }
  // service_id que só aparece em calendar_dates.txt (sem linha em calendar.txt) -
  // GTFS permite isso (serviço definido só por exceções); criamos um calendário
  // "sempre inválido por padrão" para ele existir e as exceções funcionarem.
  for (const cd of calendarDates) {
    if (serviceIdByGtfsServiceId.has(cd.service_id)) continue;
    const record = await prisma.transitService.upsert({
      where: { gtfsServiceId: cd.service_id },
      update: {},
      create: {
        gtfsServiceId: cd.service_id,
        monday: false, tuesday: false, wednesday: false, thursday: false,
        friday: false, saturday: false, sunday: false,
        startDate: parseGtfsDate(cd.date),
        endDate: parseGtfsDate(cd.date),
      },
    });
    serviceIdByGtfsServiceId.set(cd.service_id, record.id);
  }

  if (calendarDates.length > 0) {
    console.log(`Importando ${calendarDates.length} exceções de calendário (calendar_dates.txt)...`);
    const serviceIds = Array.from(serviceIdByGtfsServiceId.values());
    await prisma.transitCalendarException.deleteMany({ where: { serviceId: { in: serviceIds } } });
    await chunked(calendarDates, (batch) =>
      prisma.transitCalendarException.createMany({
        data: batch
          .map((cd) => {
            const serviceId = serviceIdByGtfsServiceId.get(cd.service_id);
            if (!serviceId) return null;
            return { serviceId, date: parseGtfsDate(cd.date), exceptionType: Number(cd.exception_type) };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
        skipDuplicates: true,
      })
    );
  } else {
    console.log('Sem calendar_dates.txt neste feed - nenhuma exceção de calendário a importar.');
  }

  // ----- 5) Shapes (replace completo por gtfs_shape_id presente no feed) -----
  if (shapes.length > 0) {
    console.log(`Importando ${shapes.length} pontos de shape (shapes.txt)...`);
    const shapeIds = Array.from(new Set(shapes.map((s) => s.shape_id)));
    await prisma.transitShape.deleteMany({ where: { gtfsShapeId: { in: shapeIds } } });
    await chunked(shapes, (batch) =>
      prisma.transitShape.createMany({
        data: batch.map((s) => ({
          gtfsShapeId: s.shape_id,
          sequence: Number(s.shape_pt_sequence),
          latitude: Number(s.shape_pt_lat),
          longitude: Number(s.shape_pt_lon),
          distTraveled: s.shape_dist_traveled ? Number(s.shape_dist_traveled) : null,
        })),
        skipDuplicates: true,
      })
    );
  } else {
    console.log('Sem shapes.txt neste feed - o traçado real da linha (US09) não estará disponível até o feed incluir shapes.');
  }

  // ----- 6) Viagens (replace completo, escopo = linhas deste feed) -----
  console.log(`Importando ${trips.length} viagens (trips.txt)...`);
  const lineIds = Array.from(lineIdByGtfsRouteId.values());
  await prisma.transitTrip.deleteMany({ where: { lineId: { in: lineIds } } });

  const tripIdByGtfsTripId = new Map<string, string>();
  const tripRowsToInsert = trips
    .map((t) => {
      const lineId = lineIdByGtfsRouteId.get(t.route_id);
      const serviceId = serviceIdByGtfsServiceId.get(t.service_id);
      if (!lineId || !serviceId) return null;
      const id = randomUUID();
      tripIdByGtfsTripId.set(t.trip_id, id);
      return {
        id,
        gtfsTripId: t.trip_id,
        lineId,
        serviceId,
        headsign: t.trip_headsign || null,
        directionId: t.direction_id !== undefined && t.direction_id !== '' ? Number(t.direction_id) : null,
        gtfsShapeId: t.shape_id || null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  await chunked(tripRowsToInsert, (batch) => prisma.transitTrip.createMany({ data: batch, skipDuplicates: true }));

  // ----- 7) Horários por parada (replace completo, escopo = viagens deste feed) -----
  console.log(`Importando ${stopTimes.length} horários por parada (stop_times.txt)...`);
  let skippedStopTimes = 0;
  const stopTimeRows = stopTimes
    .map((st) => {
      const tripId = tripIdByGtfsTripId.get(st.trip_id);
      const stopId = stopIdByGtfsStopId.get(st.stop_id);
      if (!tripId || !stopId) {
        skippedStopTimes += 1;
        return null;
      }
      return {
        tripId,
        stopId,
        sequence: Number(st.stop_sequence),
        arrivalTime: st.arrival_time,
        departureTime: st.departure_time,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  await chunked(stopTimeRows, (batch) => prisma.transitStopTime.createMany({ data: batch, skipDuplicates: true }));
  if (skippedStopTimes > 0) {
    console.warn(`⚠️  ${skippedStopTimes} linhas de stop_times.txt ignoradas por referenciarem trip_id/stop_id ausentes no feed.`);
  }

  console.log('✅ Importação concluída.');
  console.log(
    `   Linhas OFFICIAL_GTFS: ${lineIdByGtfsRouteId.size} | Paradas: ${stopIdByGtfsStopId.size} | ` +
      `Viagens: ${tripRowsToInsert.length} | Horários: ${stopTimeRows.length} | Shapes: ${shapes.length > 0 ? 'sim' : 'não'}`
  );
}

main()
  .catch((error) => {
    console.error('❌ Erro na importação do GTFS:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
