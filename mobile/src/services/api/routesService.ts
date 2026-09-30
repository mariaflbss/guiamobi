import { httpClient } from './httpClient';
import { Coordinates } from '../../types/location';
import {
  LineDetail,
  LineSearchResult,
  NearbyLineItem,
  RouteOption,
  ServiceAlertItem,
  TransitStatus,
  VehiclePositionItem,
} from '../../types/routes';

/**
 * Serviço de rotas de transporte: única camada que conhece os endpoints
 * `/routes/*` da API (Prioridade 1 - "Implementar cálculo/exibição das
 * rotas").
 */
export const routesService = {
  async searchRoutes(origin: Coordinates, destination: Coordinates): Promise<RouteOption[]> {
    const params = new URLSearchParams({
      originLat: String(origin.latitude),
      originLng: String(origin.longitude),
      destinationLat: String(destination.latitude),
      destinationLng: String(destination.longitude),
    });

    const { options } = await httpClient<{ options: RouteOption[] }>(`/routes/search?${params.toString()}`, {
      authenticated: true,
    });

    return options;
  },

  async getLineDetail(lineId: string): Promise<LineDetail> {
    const { line } = await httpClient<{ line: LineDetail }>(`/routes/lines/${lineId}`, {
      authenticated: true,
    });

    return line;
  },

  /**
   * Busca linha por número ou nome (US06/R07). Pronto para uso por uma tela
   * de busca de linha; ainda não conectado a nenhuma tela nesta sprint
   * (front-end permanece inalterado).
   */
  async searchLines(query: string): Promise<LineSearchResult[]> {
    const params = new URLSearchParams({ query });
    const { lines } = await httpClient<{ lines: LineSearchResult[] }>(
      `/routes/lines/search?${params.toString()}`,
      { authenticated: true }
    );

    return lines;
  },

  /** Informa se a API já tem dados oficiais de linhas (GTFS) carregados. */
  async getStatus(): Promise<TransitStatus> {
    return httpClient<TransitStatus>('/transit/status', { authenticated: true });
  },

  /** Posições reais de veículos da linha. `available:false` = a fonte de tempo real não está configurada (nunca há posição inventada). */
  async getVehiclePositions(lineId: string): Promise<{ available: boolean; vehicles: VehiclePositionItem[] }> {
    return httpClient<{ available: boolean; vehicles: VehiclePositionItem[] }>(
      `/routes/lines/${lineId}/vehicle-positions`,
      { authenticated: true }
    );
  },

  /** Avisos operacionais (interrupções/desvios) da linha, quando a fonte oficial estiver configurada. */
  async getServiceAlerts(lineId: string): Promise<{ available: boolean; alerts: ServiceAlertItem[] }> {
    return httpClient<{ available: boolean; alerts: ServiceAlertItem[] }>(
      `/routes/lines/${lineId}/service-alerts`,
      { authenticated: true }
    );
  },

  /** Linhas que atendem paradas perto de um ponto (ex.: onde o usuário está). */
  async getNearbyLines(point: Coordinates, radiusMeters = 150): Promise<NearbyLineItem[]> {
    const params = new URLSearchParams({
      lat: String(point.latitude),
      lng: String(point.longitude),
      radius: String(radiusMeters),
    });
    const { lines } = await httpClient<{ lines: NearbyLineItem[] }>(`/routes/nearby-lines?${params.toString()}`, {
      authenticated: true,
    });
    return lines;
  },
};
