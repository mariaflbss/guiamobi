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

export interface MapDataInput {
  stops: MapStop[];
  shape?: Coordinates[];
  pois?: MapPoi[];
  vehicles?: MapVehicle[];
  boardingIndex?: number;
  destinationIndex?: number;
  currentStopIndex?: number;
  currentStopAddress?: string;
  colors: { primary: string; primaryDark: string; success: string; origin: string };
  labels: { line: string; you: string; origin: string; stop: string; address: string; mapUnavailable: string };
}

/** Converte os dados do app no formato simples que a página do mapa entende. */
export function buildMapData(input: MapDataInput) {
  const { stops, boardingIndex, destinationIndex, currentStopIndex } = input;
  return {
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
    // Algumas viagens do GTFS não trazem shapes. Nesse caso, usa as próprias
    // paradas como traçado de fallback para que a linha continue visível no mapa.
    shape: (input.shape && input.shape.length > 1 ? input.shape : stops).map((p) => [p.latitude, p.longitude]),
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
