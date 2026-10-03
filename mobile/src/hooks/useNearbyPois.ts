import { useEffect, useState } from 'react';
import { PoiItem, poiService } from '../services/api/poiService';
import { Coordinates } from '../types/location';

/**
 * Pontos de referência reais próximos a um ponto (US09). Mantém apenas
 * categorias úteis para orientação: saúde, serviços essenciais, supermercado
 * e praça. A posição é arredondada para reaproveitar cache sem consultar a
 * fonte pública a cada pequena variação do GPS.
 */
export function useNearbyPois(center: Coordinates | null | undefined) {
  const [items, setItems] = useState<PoiItem[]>([]);
  const key = center ? `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}` : null;

  useEffect(() => {
    if (!center || !key) return;
    let cancelled = false;
    poiService
      .nearby(center, 1000, ['hospital', 'clinic', 'pharmacy', 'dentist', 'bank', 'atm', 'supermarket', 'square'])
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
