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
    const cached = routeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.options;

    const isOnline = await connectivityService.isConnected().catch(() => true);
    if (!isOnline) {
      const offline = await routeCacheRepository.find(
        origin.latitude, origin.longitude, destination.latitude, destination.longitude,
      );
      if (offline) {
        routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, options: offline.options });
        return offline.options;
      }
      throw new Error('offline');
    }

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
      // Aguarda a persistência antes de concluir a busca. Assim, se o usuário
      // desligar a conexão logo após visualizar os resultados, a rota já estará
      // disponível no SQLite para o modo offline. Falha de persistência não
      // impede a exibição da rota online.
      await routeCacheRepository.save({
        originLabel: '',
        originLatitude: origin.latitude,
        originLongitude: origin.longitude,
        destinationLabel: '',
        destinationLatitude: destination.latitude,
        destinationLongitude: destination.longitude,
        options,
      }).catch(() => undefined);
      return options;
    } catch (error) {
      if (signal?.aborted) throw error;
      const offline = await routeCacheRepository.find(
        origin.latitude, origin.longitude, destination.latitude, destination.longitude,
      );
      if (offline) {
        routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, options: offline.options });
        return offline.options;
      }
      throw error;
    }
  },

  async saveOfflineRoute(
    origin: { label?: string; latitude: number; longitude: number },
    destination: { label?: string; latitude: number; longitude: number },
    options: RouteOption[],
  ): Promise<void> {
    const existing = await routeCacheRepository.find(
      origin.latitude, origin.longitude, destination.latitude, destination.longitude,
    );
    const merged = [...(existing?.options ?? [])];
    for (const option of options) {
      const index = merged.findIndex((item) =>
        item.lineId === option.lineId &&
        item.boardingStop.id === option.boardingStop.id &&
        item.alightingStop.id === option.alightingStop.id,
      );
      if (index >= 0) merged[index] = option;
      else merged.push(option);
    }

    await routeCacheRepository.save({
      originLabel: origin.label || existing?.originLabel || '',
      originLatitude: origin.latitude,
      originLongitude: origin.longitude,
      destinationLabel: destination.label || existing?.destinationLabel || '',
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
      options: merged,
    });
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
