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
  // O usuário pode se mover dezenas de vezes por minuto durante a navegação.
  // Não fazemos uma chamada ao backend para cada pequena mudança: agrupamos a
  // posição em células de aproximadamente 500 m. Assim os POIs permanecem
  // visíveis enquanto a consulta seguinte é feita e mudam conforme a viagem
  // realmente entra em outra região.
  const key = center
    ? `${(Math.round(center.latitude / 0.003) * 0.003).toFixed(3)},${(Math.round(center.longitude / 0.003) * 0.003).toFixed(3)}`
    : null;

  useEffect(() => {
    if (!center || !key) return;
    let cancelled = false;
    poiService
      .nearby(center, 1000, ['hospital', 'clinic', 'pharmacy', 'dentist', 'bank', 'atm', 'supermarket', 'square', 'school'])
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        // Não apaga os POIs anteriores só porque uma consulta transitória
        // falhou. Eles continuam válidos até haver uma resposta nova.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return items;
}
