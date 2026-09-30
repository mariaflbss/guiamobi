import { useEffect, useState } from 'react';
import { PoiItem, poiService } from '../services/api/poiService';
import { Coordinates } from '../types/location';

/**
 * Pontos de referência reais próximos a um ponto (US09). Consulta uma vez por
 * região (arredondada a ~110 m) para não sobrecarregar a fonte pública; em
 * caso de falha/sem conexão, simplesmente não mostra POIs (nunca inventa).
 */
export function useNearbyPois(center: Coordinates | null | undefined) {
  const [items, setItems] = useState<PoiItem[]>([]);
  const key = center ? `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}` : null;

  useEffect(() => {
    if (!center || !key) return;
    let cancelled = false;
    poiService
      .nearby(center, 500, ['hospital', 'bank', 'square'])
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return items;
}
