import { SearchRoutesQuery } from './routes.schema';
import { selectTransitProvider } from './providers';
import { RouteOption, LineSearchResult, LineDetail, NearbyLine, TransitStatus } from './providers/types';

export type { RouteOption, LineSearchResult, LineDetail, NearbyLine, TransitStatus };

/**
 * Camada fina que delega ao TransitProvider selecionado no momento da
 * requisição (ver providers/index.ts). O controller/rotas não sabem, e não
 * precisam saber, se a resposta veio da fixture de desenvolvimento, de um
 * GTFS oficial importado, ou do OpenTripPlanner - todos implementam o mesmo
 * contrato (providers/types.ts:TransitProvider).
 */
export const routesService = {
  async getStatus(): Promise<TransitStatus> {
    const provider = await selectTransitProvider();
    return provider.getStatus();
  },

  async searchRoutes(query: SearchRoutesQuery): Promise<RouteOption[]> {
    const provider = await selectTransitProvider();
    return provider.searchRoutes(query);
  },

  async searchLines(term: string): Promise<LineSearchResult[]> {
    const provider = await selectTransitProvider();
    return provider.searchLines(term);
  },

  async getLineDetail(lineId: string): Promise<LineDetail | null> {
    const provider = await selectTransitProvider();
    return provider.getLineDetail(lineId);
  },

  async linesNearPoint(latitude: number, longitude: number, radiusMeters: number): Promise<NearbyLine[]> {
    const provider = await selectTransitProvider();
    return provider.linesNearPoint(latitude, longitude, radiusMeters);
  },
};
