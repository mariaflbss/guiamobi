/** Tipos das linhas dos arquivos GTFS relevantes (campos usados por este importador). */

export interface GtfsAgencyRow {
  agency_id?: string;
  agency_name: string;
  agency_url?: string;
  agency_timezone?: string;
}

export interface GtfsRouteRow {
  route_id: string;
  agency_id?: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type?: string;
}

export interface GtfsStopRow {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
  stop_code?: string;
}

export interface GtfsTripRow {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign?: string;
  direction_id?: string;
  shape_id?: string;
}

export interface GtfsStopTimeRow {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: string;
}

export interface GtfsCalendarRow {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

export interface GtfsCalendarDateRow {
  service_id: string;
  date: string;
  exception_type: string;
}

export interface GtfsShapeRow {
  shape_id: string;
  shape_pt_lat: string;
  shape_pt_lon: string;
  shape_pt_sequence: string;
  shape_dist_traveled?: string;
}

/** Converte "YYYYMMDD" (formato de data do GTFS) para Date (meia-noite UTC). */
export function parseGtfsDate(value: string): Date {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}
