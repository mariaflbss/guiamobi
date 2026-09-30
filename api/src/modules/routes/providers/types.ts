/**
 * Tipos compartilhados por qualquer implementação de TransitProvider
 * (DevFixtureProvider, GtfsDatabaseProvider, OtpRoutingProvider), para que o
 * resto da API (controller, rotas, app mobile) não precise saber qual
 * provider está ativo.
 */

export interface RouteOptionStop {
  id: string;
  name: string;
  distanceMeters: number;
  latitude: number;
  longitude: number;
}

export interface RouteOption {
  lineId: string;
  lineCode: string;
  lineName: string;
  boardingStop: RouteOptionStop;
  alightingStop: RouteOptionStop;
  stopsCount: number;
  durationMinutes: number;
  /** Só existe quando há horário real (GTFS stop_times ou fixture) para a viagem/linha. */
  nextDeparture?: string | null;
  /** Presente só quando há atraso reportado por uma fonte real (nunca inventado). */
  delayMinutes?: number;
  /** Pontos reais do traçado (GTFS shapes.txt), quando disponíveis - usado pela US09. */
  shape?: { latitude: number; longitude: number }[];
}

export interface LineSearchResult {
  lineId: string;
  lineCode: string;
  lineName: string;
  status: 'OPERATIONAL' | 'DELAYED' | 'UNAVAILABLE';
  delayMinutes: number | null;
  hasRouteData: boolean;
  officialSourceUrl?: string | null;
}

export interface LineDetailStop {
  sequence: number;
  /** Minutos desde a primeira parada da linha - usado pela tela para calcular o horário de cada parada a partir do próximo horário de partida. */
  minutesFromStart: number;
  stop: { id: string; name: string; latitude: number; longitude: number; stopCode?: string | null };
}

export interface LineDetail {
  id: string;
  code: string;
  name: string;
  stops: LineDetailStop[];
  shape?: { latitude: number; longitude: number }[];
  status: 'OPERATIONAL' | 'DELAYED' | 'UNAVAILABLE';
  delayMinutes: number | null;
  statusReason: string | null;
  hasRouteData: boolean;
  officialSourceUrl?: string | null;
}

/** Linha que passa perto de um ponto (ex.: o usuário está numa parada) - US09. */
export interface NearbyLine {
  lineId: string;
  lineCode: string;
  lineName: string;
  stop: { id: string; name: string; distanceMeters: number; latitude: number; longitude: number };
  /** Próxima partida real (HH:MM) nesta parada, quando o provider tem horários. */
  nextDeparture?: string | null;
}

export interface TransitStatus {
  hasData: boolean;
  linesCount: number;
  linesWithRouteDataCount: number;
  source: string | null;
  stopsCount: number;
  importedAt: string | null;
  /** Qual provider está respondendo agora - nunca escondido do app. */
  provider: 'dev-fixture' | 'official-gtfs' | 'otp';
}

export interface SearchRoutesQueryInput {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
}

/**
 * Contrato que qualquer fonte de dados de transporte precisa implementar.
 * Isso é o que permite trocar a fixture de desenvolvimento por um GTFS
 * oficial (ou por OpenTripPlanner) sem reescrever controller/rotas/app.
 */
export interface TransitProvider {
  readonly name: 'dev-fixture' | 'official-gtfs' | 'otp';
  getStatus(): Promise<TransitStatus>;
  searchRoutes(query: SearchRoutesQueryInput): Promise<RouteOption[]>;
  searchLines(term: string): Promise<LineSearchResult[]>;
  getLineDetail(lineId: string): Promise<LineDetail | null>;
  /** Linhas que atendem paradas dentro do raio de um ponto, da mais próxima para a mais distante. */
  linesNearPoint(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyLine[]>;
}
