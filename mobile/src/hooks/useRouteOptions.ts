import { useCallback, useEffect, useState } from 'react';
import { routesService } from '../services/api/routesService';
import { Coordinates } from '../types/location';
import { RouteOption } from '../types/routes';

/**
 * Busca as opções de ônibus entre origem e destino na API. Quando não há
 * resultado, consulta se o servidor já tem dados oficiais de linhas (GTFS)
 * para explicar o motivo ao usuário sem fingir rotas.
 */
export function useRouteOptions(origin: Coordinates | null, destination: Coordinates | null) {
  const [options, setOptions] = useState<RouteOption[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(origin && destination));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTransitData, setHasTransitData] = useState(true);

  const originLat = origin?.latitude;
  const originLng = origin?.longitude;
  const destLat = destination?.latitude;
  const destLng = destination?.longitude;

  const load = useCallback(async () => {
    if (originLat === undefined || originLng === undefined || destLat === undefined || destLng === undefined) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const results = await routesService.searchRoutes(
        { latitude: originLat, longitude: originLng },
        { latitude: destLat, longitude: destLng }
      );
      const sorted = [...results].sort((a, b) => {
        const durationDiff = a.durationMinutes - b.durationMinutes;
        if (durationDiff !== 0) return durationDiff;
        const toMinutes = (value?: string | null) => {
          if (!value) return Number.POSITIVE_INFINITY;
          const [h, m] = value.split(':').map(Number);
          if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
          const now = new Date();
          const current = now.getHours() * 60 + now.getMinutes();
          let departure = h * 60 + m;
          if (departure < current) departure += 24 * 60;
          return departure - current;
        };
        return toMinutes(a.nextDeparture) - toMinutes(b.nextDeparture);
      });
      setOptions(sorted);
      if (results.length === 0) {
        const status = await routesService.getStatus().catch(() => null);
        setHasTransitData(status ? status.hasData : true);
      } else {
        setHasTransitData(true);
      }
    } catch (error) {
      setOptions([]);
      setErrorMessage(error instanceof Error ? error.message : 'error');
    } finally {
      setIsLoading(false);
    }
  }, [originLat, originLng, destLat, destLng]);

  useEffect(() => {
    load();
  }, [load]);

  return { options, isLoading, errorMessage, hasTransitData, reload: load };
}
