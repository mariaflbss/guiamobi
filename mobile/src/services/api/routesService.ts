import { httpClient } from './httpClient';
import { connectivityService } from '../connectivity/connectivityService';
import { routeCacheRepository } from '../../database/repositories/routeCacheRepository';
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

const ROUTE_CACHE_TTL_MS = 30_000;
const routeCache = new Map<string, { expiresAt: number; options: RouteOption[] }>();

function routeCacheKey(origin: Coordinates, destination: Coordinates): string {
  return [origin.latitude, origin.longitude, destination.latitude, destination.longitude]
    .map((value) => value.toFixed(5))
    .join(':');
}

/**
 * Serviço de rotas de transporte: única camada que conhece os endpoints
 * `/routes/*` da API (Prioridade 1 - "Implementar cálculo/exibição das
 * rotas").
 */
export const routesService = {
  async searchRoutes(origin: Coordinates, destination: Coordinates, signal?: AbortSignal): Promise<RouteOption[]> {
    const key = routeCacheKey(origin, destination);

    // US16: o cache em memória é somente uma otimização da busca online.
    // Offline, a fonte de verdade é exclusivamente o armazenamento persistente
    // alimentado por saveOfflineRoute().
    const isOnline = await connectivityService.isConnected().catch(() => false);
    if (!isOnline) {
      const offline = await routeCacheRepository.find(
        origin.latitude, origin.longitude, destination.latitude, destination.longitude,
      );
      if (offline) {
        const offlineOptions = offline.options.map((option) => ({
          ...option,
          offlineCached: true,
        }));
        routeCache.set(key, {
          expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
          options: offlineOptions,
        });
        return offlineOptions;
      }
      throw new Error('offline');
    }

    const cached = routeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.options;

    const params = new URLSearchParams({
      originLat: String(origin.latitude),
      originLng: String(origin.longitude),
      destinationLat: String(destination.latitude),
      destinationLng: String(destination.longitude),
    });

    try {
      const { options } = await httpClient<{ options: RouteOption[] }>(`/routes/search?${params.toString()}`, {
        authenticated: true,
        signal,
      });

      routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, options });
      // Busca online não é cache offline. Somente saveOfflineRoute() persiste uma rota para uso sem internet.
      return options;
    } catch (error) {
      if (signal?.aborted) throw error;
      const offline = await routeCacheRepository.find(
        origin.latitude, origin.longitude, destination.latitude, destination.longitude,
      );
      if (offline) {
        routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, options: offline.options });
        return offline.options.map((option) => ({ ...option, offlineCached: true }));
      }
      throw error;
    }
  },

  async saveOfflineRoute(
    origin: { label?: string; latitude: number; longitude: number },
    destination: { label?: string; latitude: number; longitude: number },
    options: RouteOption[],
  ): Promise<void> {
    if (!options.length) {
      throw new Error('Nenhuma opção de rota foi informada para salvar offline.');
    }

    // Regra da US16: a unidade de identidade do salvamento offline é a linha,
    // não a combinação de origem e destino usada na pesquisa.
    for (const option of options) {
      await routeCacheRepository.saveUniqueLine(
        {
          originLabel: origin.label || '',
          originLatitude: origin.latitude,
          originLongitude: origin.longitude,
          destinationLabel: destination.label || '',
          destinationLatitude: destination.latitude,
          destinationLongitude: destination.longitude,
          options: [option],
        },
        option,
      );
    }

    const persisted = await routeCacheRepository.listAll();
    for (const option of options) {
      if (!persisted.some((item) => item.option.lineId === option.lineId)) {
        throw new Error('A rota não pôde ser confirmada no armazenamento offline.');
      }
    }
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
  async getVehiclePositions(lineId: string, signal?: AbortSignal): Promise<{ available: boolean; vehicles: VehiclePositionItem[] }> {
    return httpClient<{ available: boolean; vehicles: VehiclePositionItem[] }>(
      `/routes/lines/${lineId}/vehicle-positions`,
      { authenticated: true, signal }
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
  async getNearbyLines(point: Coordinates, radiusMeters = 150, signal?: AbortSignal): Promise<NearbyLineItem[]> {
    const params = new URLSearchParams({
      lat: String(point.latitude),
      lng: String(point.longitude),
      radius: String(radiusMeters),
    });
    const { lines } = await httpClient<{ lines: NearbyLineItem[] }>(`/routes/nearby-lines?${params.toString()}`, {
      authenticated: true,
      signal,
    });
    return lines;
  },
};
