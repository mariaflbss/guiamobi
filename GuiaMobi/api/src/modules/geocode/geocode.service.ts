import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

export interface PlaceResult {
  id: string;
  label: string;
  secondaryLabel: string;
  coordinates: { latitude: number; longitude: number };
}

interface NominatimItem {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: { road?: string; house_number?: string; suburb?: string };
}

/**
 * Busca de endereços intermediada pela API (US05).
 *
 * O app nunca fala com o Nominatim: a API centraliza as consultas para
 * respeitar a política de uso do serviço público
 * (https://operations.osmfoundation.org/policies/nominatim/):
 *  - no máximo 1 requisição por segundo ao Nominatim (fila com intervalo);
 *  - User-Agent identificando a aplicação e um contato (GEOCODING_CONTACT);
 *  - cache das respostas, para não repetir a mesma consulta;
 *  - sem "autocompletar a cada tecla": o app só consulta quando o usuário pede.
 * Além disso há um limite por usuário, para que uma conta não esgote a cota
 * compartilhada. Os resultados priorizam São José dos Campos e o Vale do
 * Paraíba (viewbox sem restringir: endereços de fora ainda aparecem).
 */

const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 6000;
const USER_LIMIT_PER_MINUTE = 15;
// left, top, right, bottom (lon/lat) - Vale do Paraíba e região
const VIEWBOX = '-46.4,-22.8,-45.4,-23.6';

const cache = new Map<string, { expiresAt: number; results: PlaceResult[] }>();
const userHits = new Map<string, number[]>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function normalize(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function checkUserLimit(userId: string) {
  const now = Date.now();
  const recent = (userHits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= USER_LIMIT_PER_MINUTE) {
    throw new AppError('Muitas buscas em pouco tempo. Aguarde um minuto e tente de novo.', 429);
  }
  recent.push(now);
  userHits.set(userId, recent);
}

// Executa as chamadas ao Nominatim uma de cada vez, respeitando o intervalo mínimo
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

function toPlace(item: NominatimItem): PlaceResult {
  const road = item.address?.road;
  const label = road
    ? item.address?.house_number
      ? `${road}, ${item.address.house_number}`
      : road
    : item.name || item.display_name.split(',')[0];

  return {
    id: item.osm_type && item.osm_id ? `${item.osm_type}:${item.osm_id}` : String(item.place_id),
    label,
    secondaryLabel: item.display_name,
    coordinates: { latitude: Number(item.lat), longitude: Number(item.lon) },
  };
}

export const geocodeService = {
  async search(userId: string, query: string): Promise<PlaceResult[]> {
    const key = normalize(query);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.results;

    checkUserLimit(userId);

    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      countrycodes: 'br',
      'accept-language': 'pt-BR',
      viewbox: VIEWBOX,
      bounded: '0',
    });

    const contact = env.GEOCODING_CONTACT || 'contato-nao-configurado';
    const userAgent = `GuiaMobiAcessivel/1.0 (${contact})`;

    const items = await enqueue(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${env.GEOCODING_BASE_URL}/search?${params.toString()}`, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`geocoding status ${response.status}`);
        return (await response.json()) as NominatimItem[];
      } finally {
        clearTimeout(timer);
      }
    }).catch((error) => {
      console.error('Falha na busca de endereços:', error);
      throw new AppError('O serviço de busca de endereços está indisponível agora. Tente novamente em instantes.', 502);
    });

    const results = items.map(toPlace);

    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });

    return results;
  },
};
