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
 * compartilhada. A busca é restrita a São José dos Campos (bounded=1): o
 * GuiaMobi trata do transporte municipal desta cidade, então endereços fora
 * dela não são retornados nesta fase.
 */

const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 6000;
const USER_LIMIT_PER_MINUTE = 15;
// left, top, right, bottom (lon/lat) - município de São José dos Campos/SP,
// com uma margem pequena. O GuiaMobi trata do transporte municipal de SJC,
// então a busca é restrita (bounded=1) a esta região, não só enviesada -
// endereços fora daqui não são o escopo do app nesta fase.
const SJC_VIEWBOX = '-46.05,-22.95,-45.75,-23.35';

export interface StopAddress {
  /** Nome completo da rua (logradouro), quando o OpenStreetMap conhece. */
  road: string | null;
  /** Número, quando disponível no OpenStreetMap - nunca preenchido por suposição. */
  houseNumber: string | null;
  neighbourhood: string | null;
  displayName: string;
}

const reverseCache = new Map<string, { expiresAt: number; result: StopAddress | null }>();
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
      viewbox: SJC_VIEWBOX,
      // bounded=1: restringe de verdade a São José dos Campos (não é só
      // preferência) - o GuiaMobi cobre o transporte municipal desta cidade.
      bounded: '1',
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

  /**
   * Endereço real de um ponto (ex.: uma parada), via geocodificação reversa
   * do Nominatim - mesma fila/intervalo/User-Agent/limite por usuário da
   * busca. Retorna null quando o OpenStreetMap não tem endereço para o
   * ponto (nunca inventa um).
   */
  async reverse(userId: string, latitude: number, longitude: number): Promise<StopAddress | null> {
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    const cached = reverseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    checkUserLimit(userId);

    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18',
      'accept-language': 'pt-BR',
    });

    const contact = env.GEOCODING_CONTACT || 'contato-nao-configurado';
    const userAgent = `GuiaMobiAcessivel/1.0 (${contact})`;

    const item = await enqueue(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${env.GEOCODING_BASE_URL}/reverse?${params.toString()}`, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`reverse geocoding status ${response.status}`);
        return (await response.json()) as
          | (NominatimItem & { error?: string; address?: NominatimItem['address'] & { neighbourhood?: string; quarter?: string } })
          | { error: string };
      } finally {
        clearTimeout(timer);
      }
    }).catch((error) => {
      console.error('Falha na geocodificação reversa:', error);
      throw new AppError('O serviço de endereços está indisponível agora. Tente novamente em instantes.', 502);
    });

    let result: StopAddress | null = null;
    if (!('error' in item) && 'display_name' in item) {
      const address = item.address as (NominatimItem['address'] & { neighbourhood?: string; quarter?: string }) | undefined;
      result = {
        road: address?.road ?? null,
        houseNumber: address?.house_number ?? null,
        neighbourhood: address?.suburb ?? address?.neighbourhood ?? address?.quarter ?? null,
        displayName: item.display_name,
      };
    }

    if (reverseCache.size >= CACHE_MAX_ENTRIES) {
      const oldest = reverseCache.keys().next().value;
      if (oldest !== undefined) reverseCache.delete(oldest);
    }
    reverseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });

    return result;
  },
};
