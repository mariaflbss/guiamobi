// Tipos relacionados à busca e ao detalhe de rotas de transporte

export interface RouteStopSummary {
  id: string;
  name: string;
  distanceMeters: number;
}

export interface RouteOption {
  lineId: string;
  lineCode: string;
  lineName: string;
  boardingStop: RouteStopSummary;
  alightingStop: RouteStopSummary;
  stopsCount: number;
  durationMinutes: number;
  /** Próximo horário de partida (HH:MM). Só existe quando a fonte de dados traz horários. */
  nextDeparture?: string | null;
}

export interface LineStopDetail {
  sequence: number;
  minutesFromStart: number;
  stop: { id: string; name: string; latitude: number; longitude: number };
}

export interface LineDetail {
  id: string;
  code: string;
  name: string;
  stops: LineStopDetail[];
}

/** Situação da fonte de dados de transporte público (GTFS) carregada na API. */
export interface TransitStatus {
  hasData: boolean;
  source: string | null;
  linesCount: number;
  stopsCount: number;
  importedAt: string | null;
}
