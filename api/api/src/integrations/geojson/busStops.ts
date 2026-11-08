import fs from 'node:fs';
import path from 'node:path';
import { haversineDistanceMeters } from '../../modules/routes/providers/geoUtils';

interface GeoJsonStopFeature {
  type: 'Feature';
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

interface GeoJsonStopCollection {
  type: 'FeatureCollection';
  features?: GeoJsonStopFeature[];
}

export interface GeoJsonBusStopMatch {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  properties: Record<string, unknown>;
}

let cachedStops: GeoJsonStopFeature[] | null = null;

function loadStops(): GeoJsonStopFeature[] {
  if (cachedStops) return cachedStops;
  try {
    const file = path.resolve(process.cwd(), 'data', 'sjc-bus-stops.geojson');
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as GeoJsonStopCollection;
    cachedStops = Array.isArray(parsed.features) ? parsed.features : [];
  } catch {
    cachedStops = [];
  }
  return cachedStops;
}

function normalized(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Cruza uma parada retornada pelo Google com a base GeoJSON local.
 * O cruzamento é apenas complementar: se não houver correspondência segura,
 * o dado do Google continua sendo usado e nenhum dado é inventado.
 */
export function matchGeoJsonStop(latitude: number, longitude: number, googleName: string): GeoJsonBusStopMatch | null {
  const features = loadStops();
  if (!features.length) return null;

  const googleNormalized = normalized(googleName);
  let best: GeoJsonBusStopMatch | null = null;

  for (const feature of features) {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || feature.geometry?.type !== 'Point') continue;
    const [lng, lat] = coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const distanceMeters = haversineDistanceMeters(latitude, longitude, lat, lng);
    if (distanceMeters > 75) continue;

    const properties = feature.properties ?? {};
    const name = String(properties.name ?? properties.local_ref ?? '').trim();
    const nameNormalized = normalized(name);
    const nameMatches = Boolean(googleNormalized && nameNormalized && (
      googleNormalized === nameNormalized ||
      googleNormalized.includes(nameNormalized) ||
      nameNormalized.includes(googleNormalized)
    ));

    // Sem nome compatível, aceitamos apenas uma correspondência muito próxima.
    if (!nameMatches && distanceMeters > 25) continue;

    const rawId = String(properties['@id'] ?? properties.ref ?? '').trim();
    const id = rawId ? `osm:${rawId}` : `geojson:${lat.toFixed(6)}:${lng.toFixed(6)}`;
    const candidate = { id, name: name || googleName, latitude: lat, longitude: lng, distanceMeters, properties };
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate;
  }

  return best;
}

export function geoJsonStopCount(): number {
  return loadStops().length;
}
