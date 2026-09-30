import { useEffect, useState } from 'react';
import { poiService } from '../services/api/poiService';
import { Coordinates } from '../types/location';

/** Endereço real (rua e número quando disponíveis) de uma parada, ou null se desconhecido/indisponível. */
export function useStopAddress(stop: Coordinates | null | undefined): string | undefined {
  const [text, setText] = useState<string | undefined>(undefined);
  const key = stop ? `${stop.latitude.toFixed(5)},${stop.longitude.toFixed(5)}` : null;

  useEffect(() => {
    if (!stop || !key) {
      setText(undefined);
      return;
    }
    let cancelled = false;
    poiService
      .reverseAddress(stop)
      .then((address) => {
        if (cancelled) return;
        if (!address) return setText(undefined);
        const street = address.road ? (address.houseNumber ? `${address.road}, ${address.houseNumber}` : address.road) : null;
        setText([street, address.neighbourhood].filter(Boolean).join(' - ') || address.displayName);
      })
      .catch(() => {
        if (!cancelled) setText(undefined);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return text;
}
