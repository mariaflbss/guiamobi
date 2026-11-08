import { env } from '../../config/env';
import { GtfsRealtimeHttpProvider } from './gtfsRealtimeHttpProvider';
import { NullRealtimeProvider } from './nullRealtimeProvider';
import { RealtimeProvider } from './realtimeProvider.interface';

const nullProvider = new NullRealtimeProvider();

const httpProvider =
  env.GTFS_REALTIME_TRIP_UPDATES_URL || env.GTFS_REALTIME_VEHICLE_POSITIONS_URL || env.GTFS_REALTIME_SERVICE_ALERTS_URL
    ? new GtfsRealtimeHttpProvider({
        tripUpdates: env.GTFS_REALTIME_TRIP_UPDATES_URL || undefined,
        vehiclePositions: env.GTFS_REALTIME_VEHICLE_POSITIONS_URL || undefined,
        serviceAlerts: env.GTFS_REALTIME_SERVICE_ALERTS_URL || undefined,
      })
    : null;

/** Nenhuma URL configurada -> NullRealtimeProvider (sempre "indisponível", nunca inventa dado). */
export function getRealtimeProvider(): RealtimeProvider {
  return httpProvider ?? nullProvider;
}
