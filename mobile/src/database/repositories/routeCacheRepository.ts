import { withDatabase } from '../index';
import { RouteOption } from '../../types/routes';
import { secureStorageService } from '../../services/storage/secureStorageService';
import { SECURE_STORE_KEYS } from '../../constants/config';

export interface OfflineRouteCacheInput {
  originLabel: string;
  originLatitude: number;
  originLongitude: number;
  destinationLabel: string;
  destinationLatitude: number;
  destinationLongitude: number;
  options: RouteOption[];
}

export interface OfflineRouteCacheItem extends OfflineRouteCacheInput {
  cacheKey: string;
  cachedAt: string;
}

export const routeCacheRepository = {
  async save(input: OfflineRouteCacheInput): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const cacheKey = makeCacheKey(
      input.originLatitude,
      input.originLongitude,
      input.destinationLatitude,
      input.destinationLongitude,
    );

    await withDatabase(async (db) => {
      await db.runAsync(
        `INSERT OR REPLACE INTO route_cache
          (user_id, cache_key, origin_label, origin_latitude, origin_longitude,
           destination_label, destination_latitude, destination_longitude, payload_json, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          cacheKey,
          input.originLabel,
          input.originLatitude,
          input.originLongitude,
          input.destinationLabel,
          input.destinationLatitude,
          input.destinationLongitude,
          JSON.stringify(input.options),
          new Date().toISOString(),
        ],
      );

      // Mantém um limite pequeno para não transformar o cache offline em
      // armazenamento ilimitado. As rotas mais recentes têm prioridade.
      await db.runAsync(
        `DELETE FROM route_cache
         WHERE user_id = ?
           AND rowid NOT IN (
             SELECT rowid FROM route_cache WHERE user_id = ? ORDER BY cached_at DESC LIMIT 20
           )`,
        [userId, userId],
      );
    });
  },

  async find(
    originLatitude: number,
    originLongitude: number,
    destinationLatitude: number,
    destinationLongitude: number,
  ): Promise<OfflineRouteCacheItem | null> {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const cacheKey = makeCacheKey(originLatitude, originLongitude, destinationLatitude, destinationLongitude);
    return withDatabase(async (db) => {
      const row = await db.getFirstAsync<RouteCacheRow>(
        'SELECT * FROM route_cache WHERE user_id = ? AND cache_key = ? LIMIT 1',
        [userId, cacheKey],
      );
      if (!row) return null;

      try {
        const options = JSON.parse(row.payload_json) as RouteOption[];
        return {
          cacheKey: row.cache_key,
          originLabel: row.origin_label,
          originLatitude: row.origin_latitude,
          originLongitude: row.origin_longitude,
          destinationLabel: row.destination_label,
          destinationLatitude: row.destination_latitude,
          destinationLongitude: row.destination_longitude,
          options,
          cachedAt: row.cached_at,
        };
      } catch {
        return null;
      }
    });
  },
};

function makeCacheKey(originLat: number, originLng: number, destinationLat: number, destinationLng: number): string {
  return [originLat, originLng, destinationLat, destinationLng].map((value) => value.toFixed(5)).join(':');
}

async function getCurrentUserId(): Promise<string | null> {
  const raw = await secureStorageService.getItem(SECURE_STORE_KEYS.USER);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

type RouteCacheRow = {
  cache_key: string;
  origin_label: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_label: string;
  destination_latitude: number;
  destination_longitude: number;
  payload_json: string;
  cached_at: string;
};
