import { useEffect, useState } from 'react';
import { PoiItem, poiService } from '../services/api/poiService';
import { Coordinates } from '../types/location';

/**
 * Pontos de referência reais próximos a um ponto (US09). Mantém apenas
 * categorias úteis para orientação: saúde, serviços essenciais, supermercado
 * e praça. A posição é arredondada para reaproveitar cache sem consultar a
 * fonte pública a cada pequena variação do GPS.
 */
const POI_CATEGORIES: PoiItem['category'][] = ['hospital', 'clinic', 'pharmacy', 'dentist', 'bank', 'atm', 'supermarket', 'square', 'school'];
const clientCache = new Map<string, PoiItem[]>();
const clientPending = new Map<string, { promise: Promise<PoiItem[]>; controller: AbortController; refs: number }>();
const MAX_CLIENT_CACHE = 60;

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
    const promise: Promise<PoiItem[]> = poiService.nearby(center, 1000, POI_CATEGORIES, controller.signal).then((result) => {
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
  // Quando ninguém mais precisa da consulta (célula mudou ou a tela saiu), cancela:
  // assim nada fica pendente ocupando conexão depois que a viagem termina.
  return {
    promise: current.promise,
    release: () => {
      if (released) return;
      released = true;
      current.refs -= 1;
      if (current.refs <= 0) current.controller.abort();
    },
  };
}

export function useNearbyPois(center: Coordinates | null | undefined, enabled = true) {
  const [items, setItems] = useState<PoiItem[]>([]);
  // O usuário pode se mover dezenas de vezes por minuto durante a navegação.
  // Não fazemos uma chamada ao backend para cada pequena mudança: agrupamos a
  // posição em células de aproximadamente 100-110 m. Assim os POIs permanecem
  // visíveis enquanto a consulta seguinte é feita e mudam conforme a viagem
  // realmente entra em outra região.
  const key = center
    ? `${(Math.round(center.latitude / 0.001) * 0.001).toFixed(3)},${(Math.round(center.longitude / 0.001) * 0.001).toFixed(3)}`
    : null;

  useEffect(() => {
    if (!enabled || !center || !key) return;
    let cancelled = false;
    const { promise, release } = loadCell(key, center);
    promise
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        // Não apaga os POIs anteriores só porque uma consulta transitória
        // falhou. Eles continuam válidos até haver uma resposta nova.
      });
    return () => {
      cancelled = true;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return items;
}
