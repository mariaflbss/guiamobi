/**
 * GTFS-Realtime tem 3 feeds independentes, cada um com um significado
 * diferente - importante não misturar:
 *
 * - TripUpdate: PREVISÃO de chegada/partida atualizada (pode incluir atraso
 *   em relação ao horário estático de stop_times.txt).
 * - VehiclePosition: posição REAL, ao vivo, de um veículo (lat/lon, e
 *   opcionalmente velocidade/bearing) - não é uma previsão, é onde o ônibus
 *   está agora.
 * - Alert (Service Alert): INTERRUPÇÃO/aviso operacional (desvio, linha
 *   suspensa, obra) - texto livre da operadora, não uma previsão numérica.
 *
 * O horário ESTÁTICO (de stop_times.txt, GTFS comum) é diferente dos três
 * acima: é a grade programada, sem nenhuma informação de tempo real.
 */

export interface TripUpdate {
  gtfsTripId: string;
  stopId: string;
  /** Atraso em segundos em relação ao horário estático (positivo = atrasado). */
  delaySeconds: number | null;
  /** Novo horário previsto, quando a fonte fornece um horário absoluto em vez de só o atraso. */
  predictedDepartureTime: string | null;
}

export interface VehiclePosition {
  gtfsTripId: string | null;
  gtfsVehicleId: string;
  latitude: number;
  longitude: number;
  bearing: number | null;
  speedMetersPerSecond: number | null;
  timestamp: string; // ISO 8601 - quando a posição foi reportada
}

export interface ServiceAlert {
  id: string;
  affectedLineIds: string[]; // gtfs_route_id afetados
  headerText: string;
  descriptionText: string | null;
  severity: 'INFO' | 'WARNING' | 'SEVERE' | 'UNKNOWN';
}

export interface RealtimeAvailability {
  tripUpdatesAvailable: boolean;
  vehiclePositionsAvailable: boolean;
  serviceAlertsAvailable: boolean;
}

/**
 * Contrato para qualquer fonte de dados GTFS-Realtime. A implementação
 * padrão (NullRealtimeProvider) sempre retorna "indisponível" - o app nunca
 * deve inventar posição de veículo, atraso ou alerta.
 */
export interface RealtimeProvider {
  getAvailability(): Promise<RealtimeAvailability>;
  getTripUpdates(gtfsTripIds: string[]): Promise<TripUpdate[]>;
  getVehiclePositions(gtfsRouteId: string): Promise<VehiclePosition[]>;
  getServiceAlerts(gtfsRouteId?: string): Promise<ServiceAlert[]>;
}
