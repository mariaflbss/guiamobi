import { RealtimeAvailability, RealtimeProvider, ServiceAlert, TripUpdate, VehiclePosition } from './realtimeProvider.interface';

/**
 * Provider padrão quando nenhuma URL de GTFS-Realtime está configurada.
 * Sempre reporta "indisponível" e listas vazias - nunca inventa posição de
 * veículo, atraso ou alerta.
 */
export class NullRealtimeProvider implements RealtimeProvider {
  async getAvailability(): Promise<RealtimeAvailability> {
    return { tripUpdatesAvailable: false, vehiclePositionsAvailable: false, serviceAlertsAvailable: false };
  }

  async getTripUpdates(_gtfsTripIds: string[]): Promise<TripUpdate[]> {
    return [];
  }

  async getVehiclePositions(_gtfsRouteId: string): Promise<VehiclePosition[]> {
    return [];
  }

  async getServiceAlerts(_gtfsRouteId?: string): Promise<ServiceAlert[]> {
    return [];
  }
}
