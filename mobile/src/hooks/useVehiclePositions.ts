import { useEffect, useState } from 'react';
import { routesService } from '../services/api/routesService';
import { VehiclePositionItem } from '../types/routes';

const POLL_INTERVAL_MS = 15000;

/**
 * Posições reais dos veículos de uma linha (US09), via GTFS-Realtime no
 * backend. Se a fonte não estiver configurada (`available: false`), não
 * repete a consulta e devolve lista vazia - nunca inventa posição.
 */
export function useVehiclePositions(lineId: string) {
  const [vehicles, setVehicles] = useState<VehiclePositionItem[]>([]);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const result = await routesService.getVehiclePositions(lineId);
        if (cancelled) return;
        setAvailable(result.available);
        setVehicles(result.vehicles);
        if (result.available) timer = setTimeout(load, POLL_INTERVAL_MS);
      } catch {
        // Falha de rede: mantém o que já havia e não insiste em loop apertado.
        if (!cancelled) timer = setTimeout(load, POLL_INTERVAL_MS * 2);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [lineId]);

  return { vehicles, available };
}
