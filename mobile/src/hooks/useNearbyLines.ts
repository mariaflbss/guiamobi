import { useEffect, useState } from 'react';
import { routesService } from '../services/api/routesService';
import { NearbyLineItem } from '../types/routes';
import { Coordinates } from '../types/location';

export function useNearbyLines(center: Coordinates | null | undefined) {
  const [items, setItems] = useState<NearbyLineItem[]>([]);
  const key = center ? `${center.latitude.toFixed(4)},${center.longitude.toFixed(4)}` : null;

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
