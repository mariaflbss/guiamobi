import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { PoiCategory } from './poi.schema';

export interface PoiItem {
  id: string;
  category: PoiCategory;
  name: string | null;
  latitude: number;
  longitude: number;
}

/**
 * Pontos de referência reais úteis para orientação (saúde, serviços essenciais, supermercado e praças)
 * ao redor de um ponto, vindos do OpenStreetMap via Overpass API - uma fonte
 * pública e gratuita, consultada só pelo backend (o app nunca fala com ela).
 *
 * Boas práticas da Overpass (https://wiki.openstreetmap.org/wiki/Overpass_API):
 * User-Agent identificado, raio pequeno (máx. 1 km), timeout curto, consultas
 * em série (uma por vez) e cache - a mesma região não é consultada de novo
 * durante o TTL. Não há lista fixa: se o OSM não tem POI ali, o retorno é
 * vazio. Cobertura depende do mapeamento voluntário do OSM em SJC.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const REQUEST_TIMEOUT_MS = 12000;
const MIN_INTERVAL_MS = 1000;

const cache = new Map<string, { expiresAt: number; items: PoiItem[] }>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

const OSM_FILTERS: Record<PoiCategory, string> = {
  hospital: '["amenity"="hospital"]',
  clinic: '["amenity"="clinic"]',
  pharmacy: '["amenity"="pharmacy"]',
  dentist: '["healthcare"="dentist"]',
  bank: '["amenity"="bank"]',
  atm: '["amenity"="atm"]',
  supermarket: '["shop"="supermarket"]',
  square: '["place"="square"]',
};

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

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function categoryOf(tags: Record<string, string> | undefined, wanted: PoiCategory[]): PoiCategory | null {
  if (!tags) return null;
  for (const category of wanted) {
    if (category === 'hospital' && tags.amenity === 'hospital') return category;
    if (category === 'clinic' && tags.amenity === 'clinic') return category;
    if (category === 'pharmacy' && tags.amenity === 'pharmacy') return category;
    if (category === 'dentist' && tags.healthcare === 'dentist') return category;
    if (category === 'bank' && tags.amenity === 'bank') return category;
    if (category === 'atm' && tags.amenity === 'atm') return category;
    if (category === 'supermarket' && tags.shop === 'supermarket') return category;
    if (category === 'square' && tags.place === 'square') return category;
  }
  return null;
}

export function buildOverpassQuery(lat: number, lng: number, radius: number, categories: PoiCategory[]): string {
  const clauses = categories.map((c) => `nwr${OSM_FILTERS[c]}(around:${radius},${lat},${lng});`).join('');
  return `[out:json][timeout:10];(${clauses});out center 60;`;
}

export const poiService = {
  async nearby(lat: number, lng: number, radius: number, categories: PoiCategory[]): Promise<PoiItem[]> {
    if (categories.length === 0) return [];

    // Arredonda a ~110 m para reaproveitar o cache entre buscas muito próximas
    const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radius},${[...categories].sort().join('|')}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.items;

    const query = buildOverpassQuery(lat, lng, radius, categories);
    const contact = env.GEOCODING_CONTACT || 'contato-nao-configurado';

    const elements = await enqueue(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(env.OVERPASS_URL, {
          method: 'POST',
          headers: {
            'User-Agent': `GuiaMobiAcessivel/1.0 (${contact})`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`overpass status ${response.status}`);
        const body = (await response.json()) as { elements?: OverpassElement[] };
        return body.elements ?? [];
      } finally {
        clearTimeout(timer);
      }
    }).catch((error) => {
      console.error('Falha na consulta de pontos de referência:', error);
      throw new AppError('O serviço de pontos de referência está indisponível agora. Tente novamente em instantes.', 502);
    });

    const items: PoiItem[] = [];
    for (const element of elements) {
      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;
      const category = categoryOf(element.tags, categories);
      if (latitude === undefined || longitude === undefined || !category) continue;

      items.push({
        id: `${element.type}:${element.id}`,
        category,
        name: element.tags?.name ?? null,
        latitude,
        longitude,
      });
    }

    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, items });

    return items;
  },
};
