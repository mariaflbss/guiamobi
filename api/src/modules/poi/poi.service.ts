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
 * Pontos de referência reais (hospitais, bancos, praças, farmácias, escolas)
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
const REQUEST_TIMEOUT_MS = 9000;
const MIN_INTERVAL_MS = 1000;

const cache = new Map<string, { expiresAt: number; items: PoiItem[] }>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

const OSM_FILTERS: Record<PoiCategory, string> = {
  hospital: '["amenity"="hospital"]',
  clinic: '["amenity"="clinic"]',
  bank: '["amenity"="bank"]',
  atm: '["amenity"="atm"]',
  square: '["place"="square"]',
  pharmacy: '["amenity"="pharmacy"]',
  dentist: '["amenity"="dentist"]',
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

/** Praça no OSM: place=square, ou parque/praça nomeado como "Praça ...". */
function isSquare(tags: Record<string, string>): boolean {
  if (tags.place === 'square') return true;
  return (tags.leisure === 'park' || tags.leisure === 'garden') && /^pra[çc]a\b/i.test(tags.name ?? '');
}

function categoryOf(tags: Record<string, string> | undefined, wanted: PoiCategory[]): PoiCategory | null {
  if (!tags) return null;
  for (const category of wanted) {
    if (category === 'hospital' && tags.amenity === 'hospital') return category;
    if (category === 'clinic' && tags.amenity === 'clinic') return category;
    if (category === 'bank' && tags.amenity === 'bank') return category;
    if (category === 'atm' && tags.amenity === 'atm') return category;
    if (category === 'square' && isSquare(tags)) return category;
    if (category === 'pharmacy' && tags.amenity === 'pharmacy') return category;
    if (category === 'dentist' && tags.amenity === 'dentist') return category;
  }
  return null;
}

export function buildOverpassQuery(lat: number, lng: number, radius: number, categories: PoiCategory[]): string {
  // Uma única busca agrupada é bem mais leve que várias consultas separadas.
  const around = `(around:${radius},${lat},${lng})`;
  const amenities = categories
    .map((category) => OSM_FILTERS[category].match(/"amenity"="([^"]+)"/)?.[1])
    .filter((value): value is string => Boolean(value));
  const clauses: string[] = [];

  if (amenities.length > 0) clauses.push(`nwr["amenity"~"^(${amenities.join('|')})$"]${around};`);
  if (categories.includes('square')) {
    clauses.push(`nwr["place"="square"]${around};`);
    clauses.push(`nwr["leisure"~"^(park|garden)$"]["name"~"^Pra[çc]a",i]${around};`);
  }

  return `[out:json][timeout:8];(${clauses.join('')});out center 300;`;
}

export const poiService = {
  async nearby(lat: number, lng: number, radius: number, categories: PoiCategory[]): Promise<PoiItem[]> {
    if (categories.length === 0) return [];

    // Arredonda a ~11 m para reduzir erros de cobertura na borda do raio de 1 km
    const key = `${lat.toFixed(4)},${lng.toFixed(4)},${radius},${[...categories].sort().join('|')}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.items;

    const query = buildOverpassQuery(lat, lng, radius, categories);
    const contact = env.GEOCODING_CONTACT || 'contato-nao-configurado';

    const requestStartedAt = Date.now();
    console.info(`[POI] iniciando consulta ${key}.`);
    const queueStartedAt = Date.now();
    const endpoints = Array.from(new Set([
      env.OVERPASS_URL,
      ...env.OVERPASS_FALLBACK_URLS.split(',').map((url) => url.trim()).filter(Boolean),
    ]));

    const elements = await enqueue(async () => {
      console.info(`[POI] ${key} entrou na execução após ${Date.now() - queueStartedAt}ms.`);
      let lastError: unknown = null;

      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'User-Agent': `GuiaMobiAcessivel/1.0 (${contact})`,
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`overpass status ${response.status}`);
          const body = (await response.json()) as { elements?: OverpassElement[] };
          const result = body.elements ?? [];
          if (result.length > 0 || endpoint === endpoints[endpoints.length - 1]) {
            console.info(`[POI] ${key} respondeu via ${endpoint} com ${result.length} elemento(s).`);
            return result;
          }
          console.warn(`[POI] ${endpoint} respondeu vazio para ${key}; tentando o próximo espelho.`);
        } catch (error) {
          lastError = error;
          console.warn(`[POI] falha em ${endpoint} para ${key}; tentando o próximo espelho.`);
        } finally {
          clearTimeout(timer);
        }
      }

      throw lastError instanceof Error ? lastError : new Error('nenhum endpoint Overpass respondeu');
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
    console.info(`[POI] consulta ${key} concluída em ${Date.now() - requestStartedAt}ms (${items.length} item(ns)).`);

    return items;
  },
};
