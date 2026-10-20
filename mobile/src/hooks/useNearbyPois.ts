import { useEffect, useState } from 'react';
import { PoiItem, poiService } from '../services/api/poiService';
import { Coordinates } from '../types/location';

/**
 * Pontos de referência reais próximos a um ponto (US09). Mantém apenas
 * categorias úteis para orientação: hospital, clínica, farmácia, dentista,
 * banco, caixa eletrônico e praça. A posição é arredondada para reaproveitar cache sem consultar a
 * fonte pública a cada pequena variação do GPS.
 */
const POI_CATEGORIES: PoiItem['category'][] = ['hospital', 'clinic', 'pharmacy', 'dentist', 'bank', 'atm', 'square'];
const clientCache = new Map<string, PoiItem[]>();
const clientPending = new Map<string, { promise: Promise<PoiItem[]>; controller: AbortController; refs: number }>();
const MAX_CLIENT_CACHE = 60;
const POI_CELL_DEGREES = 0.002;
// A consulta é feita no CENTRO da célula com folga sobre o raio de 1 km (meia
// diagonal da célula ~160 m). Assim qualquer posição dentro da célula tem
// cobertura local mais enxuta e reduz a quantidade de dados consultados.
const QUERY_RADIUS_METERS = 500;
const MAX_ATTEMPTS = 3;

function remember(key: string, value: PoiItem[]): void {
  clientCache.delete(key);
  clientCache.set(key, value);
  while (clientCache.size > MAX_CLIENT_CACHE) {
    const oldest = clientCache.keys().next().value;
    if (oldest === undefined) break;
    clientCache.delete(oldest);
  }
}

function loadCell(key: string, center: Coordinates): { promise: Promise<PoiItem[]>; release: () => void } {
  const cached = clientCache.get(key);
  if (cached) return { promise: Promise.resolve(cached), release: () => undefined };
  let entry = clientPending.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise: Promise<PoiItem[]> = poiService.nearby(center, QUERY_RADIUS_METERS, POI_CATEGORIES, controller.signal).then((result) => {
      remember(key, result);
      return result;
    }).finally(() => {
      if (clientPending.get(key)?.promise === promise) clientPending.delete(key);
    });
    entry = { promise, controller, refs: 0 };
    clientPending.set(key, entry);
  }
  entry.refs += 1;
  const current = entry;
  let released = false;
  // A consulta de orientação é relativamente pesada (Overpass). Se o GPS
  // cruzar a célula enquanto a resposta ainda está chegando, mantemos a
  // requisição em voo para que ela possa preencher o cache e ser exibida assim
  // que chegar. O resultado continua protegido pelo `cancelled` do hook, então
  // uma tela que saiu não recebe atualização tardia.
  return {
    promise: current.promise,
    release: () => {
      if (released) return;
      released = true;
      current.refs -= 1;
    },
  };
}

export function useNearbyPois(center: Coordinates | null | undefined, enabled = true) {
  const [items, setItems] = useState<PoiItem[]>([]);
  // Não consultamos o Overpass a cada pequena variação do GPS. Uma célula de
  // aproximadamente 220 m mantém boa cobertura sobre o raio de 1 km e
  // reduz bastante o número de chamadas durante a simulação.
  const key = center
    ? `${(Math.round(center.latitude / POI_CELL_DEGREES) * POI_CELL_DEGREES).toFixed(3)},${(Math.round(center.longitude / POI_CELL_DEGREES) * POI_CELL_DEGREES).toFixed(3)}`
    : null;

  useEffect(() => {
    if (!enabled || !center || !key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let release: () => void = () => undefined;
    const cellCenter: Coordinates = {
      latitude: Math.round(center.latitude / POI_CELL_DEGREES) * POI_CELL_DEGREES,
      longitude: Math.round(center.longitude / POI_CELL_DEGREES) * POI_CELL_DEGREES,
    };
    const attempt = (n: number) => {
      const loaded = loadCell(key, cellCenter);
      release = loaded.release;
      loaded.promise
        .then((result) => {
          if (!cancelled) setItems(result);
        })
        .catch(() => {
          // Não apaga os POIs anteriores só porque uma consulta transitória
          // falhou (a fonte pública às vezes oscila): tenta de novo com espera
          // crescente, sem bloquear a tela.
          release();
          if (cancelled || n >= MAX_ATTEMPTS) return;
          timer = setTimeout(() => attempt(n + 1), 1500 * n);
        });
    };
    attempt(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return items;
}
