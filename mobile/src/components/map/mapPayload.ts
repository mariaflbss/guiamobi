import { Coordinates } from '../../types/location';

/** Parada com nome opcional (as telas já passam o objeto completo da parada). */
export interface MapStop extends Coordinates {
  name?: string;
}

export interface MapVehicle {
  id: string;
  latitude: number;
  longitude: number;
}

export interface MapPoi {
  id: string;
  category: 'hospital' | 'bank' | 'square' | 'pharmacy' | 'school';
  name: string | null;
  latitude: number;
  longitude: number;
}

/**
 * Cores dos marcadores. São FIXAS (não dependem do tema claro/escuro) porque
 * precisam continuar distintas entre si sobre o mapa, que é sempre claro, e
 * porque a legenda usa exatamente as mesmas cores.
 *
 *  - Você     = azul ESCURO (GPS do aparelho)
 *  - Origem   = azul CLARO com aro azul-escuro (parada de embarque)
 *  - Destino  = verde
 *  - demais paradas = cinza neutro (nunca confundir com os três acima)
 */
export const MAP_MARKER_COLORS = {
  you: '#0B2E6B',
  origin: '#7CC4FA',
  originRing: '#0F5FA8',
  destination: '#16A34A',
  stop: '#64748B',
} as const;

export interface MapColors {
  line: string;
  you: string;
  origin: string;
  originRing: string;
  destination: string;
  stop: string;
}

export interface MapDataInput {
  stops: MapStop[];
  shape?: Coordinates[];
  pois?: MapPoi[];
  vehicles?: MapVehicle[];
  boardingIndex?: number;
  destinationIndex?: number;
  currentStopIndex?: number;
  currentStopAddress?: string;
  colors: MapColors;
  labels: {
    line: string;
    you: string;
    origin: string;
    destination: string;
    stop: string;
    address: string;
    mapUnavailable: string;
  };
}

/** Converte os dados do app no formato simples que a página do mapa entende. */
export function buildMapData(input: MapDataInput) {
  const { stops, boardingIndex, destinationIndex, currentStopIndex } = input;
  // Único ponto por onde um traçado chega ao mapa: só passa geometria real.
  const shape = evaluateShape(input.shape, stops);
  return {
    shapeStatus: shape.status,
    stops: stops.map((stop, index) => ({
      lat: stop.latitude,
      lon: stop.longitude,
      index,
      name: stop.name ?? '',
      boarding: index === boardingIndex,
      destination: index === destinationIndex,
      current: index === currentStopIndex,
      address: index === currentStopIndex ? input.currentStopAddress ?? '' : '',
    })),
    shape: shape.points.map((p) => [p.latitude, p.longitude]),
    pois: (input.pois ?? []).map((poi) => ({
      lat: poi.latitude,
      lon: poi.longitude,
      name: poi.name ?? '',
      category: poi.category,
    })),
    vehicles: (input.vehicles ?? []).map((v) => [v.latitude, v.longitude]),
    colors: input.colors,
    labels: input.labels,
  };
}

/**
 * Monta o script que chama `window.GM.<method>(arg)` dentro da página do mapa.
 * O argumento vai como JSON (literal JS válido); U+2028/2029 são escapados por segurança.
 */
export function buildPageCall(method: 'setData' | 'setUser' | 'setMapType', arg: unknown): string {
  const json = JSON.stringify(arg).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `(function(){try{if(window.GM){window.GM.${method}(${json});}}catch(e){}})();true;`;
}

/** Normaliza a URL-base do WebView (precisa terminar em "/"). */
export function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/* ------------------------------------------------------------------ */
/* Validação do traçado: só desenhamos geometria REAL, nunca inventada. */
/* ------------------------------------------------------------------ */

/** Vértice a menos disso de uma parada é considerado "a própria parada". */
const SHAPE_STOP_SNAP_METERS = 8;
/** Vértices a menos disso um do outro são o mesmo ponto (duplicado). */
const SHAPE_DUPLICATE_METERS = 0.5;
/**
 * Um traçado que segue ruas tem vértices a cada poucas dezenas de metros
 * (GTFS shapes.txt, OTP). Se a MEDIANA dos segmentos passa disso, a geometria
 * é só uma sequência de retas longas (cortando quadras/casas), não o trajeto.
 */
const SHAPE_MAX_MEDIAN_SEGMENT_METERS = 400;

export type ShapeStatus =
  | 'ok'
  /** Não veio traçado (ou menos de 2 pontos válidos). */
  | 'missing'
  /** Todos os vértices coincidem com paradas: é "ligar as paradas", não um trajeto. */
  | 'derived-from-stops'
  /** Poucos vértices / segmentos longos demais: reta, não rua. */
  | 'too-coarse';

export interface ShapeEvaluation {
  status: ShapeStatus;
  /** Pontos a desenhar. VAZIO sempre que status !== 'ok' (nunca há fallback). */
  points: Coordinates[];
}

function meters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Decide se o traçado recebido é geometria real de rua. Se não for, devolve
 * `points: []` - a linha fica AUSENTE e a tela informa. As paradas NUNCA são
 * usadas como substituto para desenhar uma reta.
 */
export function evaluateShape(shape: Coordinates[] | undefined | null, stops: Coordinates[]): ShapeEvaluation {
  const valid = (shape ?? []).filter(
    (p) =>
      p &&
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude) &&
      Math.abs(p.latitude) <= 90 &&
      Math.abs(p.longitude) <= 180
  );

  const points: Coordinates[] = [];
  for (const p of valid) {
    const last = points[points.length - 1];
    if (!last || meters(last, p) > SHAPE_DUPLICATE_METERS) points.push(p);
  }
  if (points.length < 2) return { status: 'missing', points: [] };

  const allOnStops =
    stops.length > 0 && points.every((p) => stops.some((s) => meters(p, s) <= SHAPE_STOP_SNAP_METERS));
  if (allOnStops) return { status: 'derived-from-stops', points: [] };

  const segments: number[] = [];
  for (let i = 1; i < points.length; i += 1) segments.push(meters(points[i - 1], points[i]));
  segments.sort((a, b) => a - b);
  const median = segments[Math.floor(segments.length / 2)];
  if (median > SHAPE_MAX_MEDIAN_SEGMENT_METERS) return { status: 'too-coarse', points: [] };

  return { status: 'ok', points };
}
