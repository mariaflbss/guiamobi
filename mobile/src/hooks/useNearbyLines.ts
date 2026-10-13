import { useEffect, useState } from 'react';
import { routesService } from '../services/api/routesService';
import { NearbyLineItem } from '../types/routes';
import { Coordinates } from '../types/location';

export function useNearbyLines(center: Coordinates | null | undefined) {
  const [items, setItems] = useState<NearbyLineItem[]>([]);
  // A consulta é usada apenas para detectar linhas muito próximas (raio de 150 m).
  // Não precisa acompanhar cada atualização do GPS; agrupar em células de ~110 m
  // evita uma requisição a cada poucos metros durante a navegação.
  const key = center
    ? `${(Math.round(center.latitude / 0.001) * 0.001).toFixed(3)},${(Math.round(center.longitude / 0.001) * 0.001).toFixed(3)}`
    : null;

  useEffect(() => {
    if (!center || !key) { setItems([]); return; }
    let cancelled = false;
    routesService.getNearbyLines(center, 150)
      .then((result) => { if (!cancelled) setItems(result); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [key]);

  return items;
}
