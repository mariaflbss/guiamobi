import { useEffect, useState } from 'react';
import { routesService } from '../services/api/routesService';
import { VehiclePositionItem } from '../types/routes';

const POLL_INTERVAL_MS = 15000;

/**
 * Posições reais dos veículos de uma linha (US09), via GTFS-Realtime no
 * backend. Se a fonte não estiver configurada (`available: false`), não
 * repete a consulta e devolve lista vazia - nunca inventa posição.
 */
export function useVehiclePositions(lineId: string, enabled = true) {
  const [vehicles, setVehicles] = useState<VehiclePositionItem[]>([]);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    async function load() {
      try {
        controller = new AbortController();
        const result = await routesService.getVehiclePositions(lineId, controller.signal);
        if (cancelled) return;
        setAvailable(result.available);
        setVehicles(result.vehicles);
        if (result.available) timer = setTimeout(load, POLL_INTERVAL_MS);
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        // Falha de rede: mantém o que já havia e não insiste em loop apertado.
        if (!cancelled) timer = setTimeout(load, POLL_INTERVAL_MS * 2);
      }
    }

    if (enabled) load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [lineId, enabled]);

  return { vehicles, available };
}
