import { transit_realtime } from 'gtfs-realtime-bindings';
import { RealtimeAvailability, RealtimeProvider, ServiceAlert, TripUpdate, VehiclePosition } from './realtimeProvider.interface';

/**
 * Cliente real de GTFS-Realtime (protobuf), para quando a Prefeitura/
 * operadora de São José dos Campos disponibilizar os feeds via
 * credenciamento (Decreto Municipal 19.294/2023 - ver README de
 * api/src/integrations/transit/). Implementa o protocolo padrão do Google
 * (transit_realtime.FeedMessage) usando o pacote oficial
 * "gtfs-realtime-bindings" - não é um formato inventado.
 *
 * Cada URL é opcional e independente: se GTFS_REALTIME_VEHICLE_POSITIONS_URL
 * não estiver configurada, por exemplo, getVehiclePositions() simplesmente
 * não faz nenhuma chamada de rede e retorna lista vazia - nunca inventa uma
 * posição.
 *
 * Não testado neste ambiente por não haver um feed real de SJC disponível;
 * a decodificação segue estritamente a especificação GTFS-Realtime
 * (https://gtfs.org/realtime/reference/).
 */
export class GtfsRealtimeHttpProvider implements RealtimeProvider {
  constructor(
    private readonly urls: {
      tripUpdates?: string;
      vehiclePositions?: string;
      serviceAlerts?: string;
    }
  ) {}

  private async fetchFeed(url: string): Promise<transit_realtime.FeedMessage> {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      throw new Error(`Feed GTFS-Realtime respondeu ${response.status}: ${url}`);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return transit_realtime.FeedMessage.decode(buffer);
  }

  async getAvailability(): Promise<RealtimeAvailability> {
    return {
      tripUpdatesAvailable: Boolean(this.urls.tripUpdates),
      vehiclePositionsAvailable: Boolean(this.urls.vehiclePositions),
      serviceAlertsAvailable: Boolean(this.urls.serviceAlerts),
    };
  }

  async getTripUpdates(gtfsTripIds: string[]): Promise<TripUpdate[]> {
    if (!this.urls.tripUpdates) return [];

    const feed = await this.fetchFeed(this.urls.tripUpdates);
    const wanted = new Set(gtfsTripIds);
    const updates: TripUpdate[] = [];

    for (const entity of feed.entity) {
      const tripUpdate = entity.tripUpdate;
      const tripId = tripUpdate?.trip?.tripId;
      if (!tripUpdate || !tripId || !wanted.has(tripId)) continue;

      for (const stopTimeUpdate of tripUpdate.stopTimeUpdate ?? []) {
        const event = stopTimeUpdate.departure ?? stopTimeUpdate.arrival;
        if (!stopTimeUpdate.stopId) continue;

        updates.push({
          gtfsTripId: tripId,
          stopId: stopTimeUpdate.stopId,
          delaySeconds: event?.delay ?? tripUpdate.delay ?? null,
          predictedDepartureTime: event?.time
            ? new Date(Number(event.time) * 1000).toISOString()
            : null,
        });
      }
    }

    return updates;
  }

  async getVehiclePositions(gtfsRouteId: string): Promise<VehiclePosition[]> {
    if (!this.urls.vehiclePositions) return [];

    const feed = await this.fetchFeed(this.urls.vehiclePositions);
    const positions: VehiclePosition[] = [];

    for (const entity of feed.entity) {
      const vehicle = entity.vehicle;
      if (!vehicle?.position) continue;
      if (vehicle.trip?.routeId && vehicle.trip.routeId !== gtfsRouteId) continue;

      positions.push({
        gtfsTripId: vehicle.trip?.tripId ?? null,
        gtfsVehicleId: vehicle.vehicle?.id ?? entity.id,
        latitude: vehicle.position.latitude,
        longitude: vehicle.position.longitude,
        bearing: vehicle.position.bearing ?? null,
        speedMetersPerSecond: vehicle.position.speed ?? null,
        timestamp: vehicle.timestamp
          ? new Date(Number(vehicle.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
      });
    }

    return positions;
  }

  async getServiceAlerts(gtfsRouteId?: string): Promise<ServiceAlert[]> {
    if (!this.urls.serviceAlerts) return [];

    const feed = await this.fetchFeed(this.urls.serviceAlerts);
    const alerts: ServiceAlert[] = [];

    for (const entity of feed.entity) {
      const alert = entity.alert;
      if (!alert) continue;

      const affectedLineIds = (alert.informedEntity ?? [])
        .map((e) => e.routeId)
        .filter((id): id is string => Boolean(id));

      if (gtfsRouteId && !affectedLineIds.includes(gtfsRouteId)) continue;

      alerts.push({
        id: entity.id,
        affectedLineIds,
        headerText: translatedStringToText(alert.headerText) ?? '(sem título)',
        descriptionText: translatedStringToText(alert.descriptionText),
        severity: mapSeverity(alert.severityLevel),
      });
    }

    return alerts;
  }
}

function translatedStringToText(value?: transit_realtime.ITranslatedString | null): string | null {
  const translations = value?.translation ?? [];
  const ptBr = translations.find((t) => t.language === 'pt' || t.language === 'pt-BR');
  return ptBr?.text ?? translations[0]?.text ?? null;
}

function mapSeverity(level?: transit_realtime.Alert.SeverityLevel | null): ServiceAlert['severity'] {
  switch (level) {
    case transit_realtime.Alert.SeverityLevel.INFO:
      return 'INFO';
    case transit_realtime.Alert.SeverityLevel.WARNING:
      return 'WARNING';
    case transit_realtime.Alert.SeverityLevel.SEVERE:
      return 'SEVERE';
    default:
      return 'UNKNOWN';
  }
}
