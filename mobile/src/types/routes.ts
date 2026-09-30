// Tipos relacionados à busca e ao detalhe de rotas de transporte

export interface RouteStopSummary {
  id: string;
  name: string;
  distanceMeters: number;
  latitude?: number;
  longitude?: number;
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
  /** Minutos de atraso reportado para a linha (só aparece quando há atraso real cadastrado). */
  delayMinutes?: number;
  /** Traçado real (GTFS shapes.txt), quando o provider ativo tem essa geometria. */
  shape?: { latitude: number; longitude: number }[];
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
  /** Pontos reais do traçado da linha (GTFS shapes.txt), quando disponíveis. */
  shape?: { latitude: number; longitude: number }[];
  /** Link do PDF oficial de horário/itinerário publicado pela Prefeitura de SJC, quando existe. */
  officialSourceUrl?: string | null;
  /** true quando a linha já tem paradas cadastradas (participa da busca por origem/destino). */
  hasRouteData?: boolean;
}

/** Situação da fonte de dados de transporte público carregada na API. */
export interface TransitStatus {
  /** Reflete se há linha com PARADAS cadastradas (portanto utilizável na busca por origem/destino). */
  hasData: boolean;
  /** Total de linhas oficiais conhecidas (nome/código), com ou sem paradas ainda. */
  linesCount: number;
  /** Quantas dessas linhas já têm paradas cadastradas. */
  linesWithRouteDataCount: number;
  source: string | null;
  stopsCount: number;
  importedAt: string | null;
  /** Qual fonte está respondendo: fixture de desenvolvimento, GTFS oficial importado ou OpenTripPlanner. */
  provider?: 'dev-fixture' | 'official-gtfs' | 'otp';
}

/** Posição real de veículo (GTFS-Realtime). Só existe quando a fonte oficial está configurada. */
export interface VehiclePositionItem {
  gtfsVehicleId: string;
  gtfsTripId: string | null;
  latitude: number;
  longitude: number;
  bearing: number | null;
  speedMetersPerSecond: number | null;
  timestamp: string;
}

export interface ServiceAlertItem {
  id: string;
  affectedLineIds: string[];
  headerText: string;
  descriptionText: string | null;
  severity: 'INFO' | 'WARNING' | 'SEVERE' | 'UNKNOWN';
}

/** Resultado da busca de linha por número ou nome (US06/R07). */
export interface LineSearchResult {
  lineId: string;
  lineCode: string;
  lineName: string;
  status: 'OPERATIONAL' | 'DELAYED' | 'UNAVAILABLE';
  delayMinutes: number | null;
  /** true quando a linha já tem paradas cadastradas (participa da busca por origem/destino). */
  hasRouteData: boolean;
  /** Link do PDF oficial de horário/itinerário publicado pela Prefeitura de SJC, quando existe. */
  officialSourceUrl?: string | null;
}

/** Linha que passa perto do usuário (ex.: ele está numa parada) - sugestão da US09. */
export interface NearbyLineItem {
  lineId: string;
  lineCode: string;
  lineName: string;
  stop: { id: string; name: string; distanceMeters: number; latitude: number; longitude: number };
  /** Próxima partida real (HH:MM) nesta parada, quando a fonte tem horários. */
  nextDeparture?: string | null;
}
