import { httpClient } from './httpClient';
import { Coordinates } from '../../types/location';
import { LineDetail, RouteOption, TransitStatus } from '../../types/routes';

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

  /** Informa se a API já tem dados oficiais de linhas (GTFS) carregados. */
  async getStatus(): Promise<TransitStatus> {
    return httpClient<TransitStatus>('/transit/status', { authenticated: true });
  },
};
