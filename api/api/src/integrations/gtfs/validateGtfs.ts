import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import path from 'path';

function readCsv<T>(zip: AdmZip, name: string): T[] {
  const entry = zip.getEntry(name);
  if (!entry) return [];
  return parse(entry.getData().toString('utf8'), { columns: true, skip_empty_lines: true, trim: true }) as T[];
}

const source = process.argv[2] || path.resolve(__dirname, '../../../data/google_transit.zip');
const zip = new AdmZip(source);
const routes = readCsv<Record<string, string>>(zip, 'routes.txt');
const stops = readCsv<Record<string, string>>(zip, 'stops.txt');
const trips = readCsv<Record<string, string>>(zip, 'trips.txt');
const stopTimes = readCsv<Record<string, string>>(zip, 'stop_times.txt');
const calendar = readCsv<Record<string, string>>(zip, 'calendar.txt');
const calendarDates = readCsv<Record<string, string>>(zip, 'calendar_dates.txt');
const shapes = readCsv<Record<string, string>>(zip, 'shapes.txt');

const required = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'];
for (const name of required) {
  if (!zip.getEntry(name)) throw new Error(`Arquivo obrigatório ausente: ${name}`);
}

const routeIds = new Set<string>();
const duplicateRouteIds: string[] = [];
for (const route of routes) {
  if (!route.route_id) throw new Error('routes.txt contém route_id vazio.');
  if (routeIds.has(route.route_id)) duplicateRouteIds.push(route.route_id);
  routeIds.add(route.route_id);
}

const shortNames = new Map<string, number>();
for (const route of routes) {
  if (route.route_short_name) shortNames.set(route.route_short_name, (shortNames.get(route.route_short_name) ?? 0) + 1);
}
const duplicatedShortNames = [...shortNames.entries()].filter(([, count]) => count > 1);

for (const stop of stops) {
  if (!stop.stop_id || !stop.stop_name || !Number.isFinite(Number(stop.stop_lat)) || !Number.isFinite(Number(stop.stop_lon))) {
    throw new Error(`stops.txt contém uma parada inválida: ${stop.stop_id ?? '(sem stop_id)'}`);
  }
}

for (const trip of trips) {
  if (!trip.trip_id || !trip.route_id || !trip.service_id) throw new Error('trips.txt contém trip sem trip_id/route_id/service_id.');
}

console.log('GTFS válido para importação:');
console.log(`  routes: ${routes.length}`);
console.log(`  stops: ${stops.length}`);
console.log(`  trips: ${trips.length}`);
console.log(`  stop_times: ${stopTimes.length}`);
console.log(`  calendar: ${calendar.length}`);
console.log(`  calendar_dates: ${calendarDates.length}`);
console.log(`  shapes: ${shapes.length}`);
console.log(`  route_id únicos: ${routeIds.size}`);
console.log(`  route_id duplicados: ${duplicateRouteIds.length}`);
console.log(`  route_short_name repetidos: ${duplicatedShortNames.length}`);
if (duplicatedShortNames.length) {
  console.log(`  exemplos de códigos repetidos: ${duplicatedShortNames.slice(0, 10).map(([name, count]) => `${name} (${count})`).join(', ')}`);
}
