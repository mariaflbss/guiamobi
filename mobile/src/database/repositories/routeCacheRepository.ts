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

export interface OfflineSavedRouteItem {
  cacheKey: string;
  cachedAt: string;
  originLabel: string;
  originLatitude: number;
  originLongitude: number;
  destinationLabel: string;
  destinationLatitude: number;
  destinationLongitude: number;
  option: RouteOption;
}

export const routeCacheRepository = {
  async save(input: OfflineRouteCacheInput): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Não foi possível identificar o usuário para salvar a rota offline.');
    }

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

    const cacheKey = makeCacheKey(
      originLatitude,
      originLongitude,
      destinationLatitude,
      destinationLongitude,
    );

    return withDatabase(async (db) => {
      const row = await db.getFirstAsync<RouteCacheRow>(
        'SELECT * FROM route_cache WHERE user_id = ? AND cache_key = ? LIMIT 1',
        [userId, cacheKey],
      );
      if (!row) return null;

      return parseRow(row);
    });
  },

  async listAll(): Promise<OfflineSavedRouteItem[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    return withDatabase(async (db) => {
      const rows = await db.getAllAsync<RouteCacheRow>(
        `SELECT * FROM route_cache
         WHERE user_id = ?
         ORDER BY cached_at DESC, rowid DESC`,
        [userId],
      );

      const items: OfflineSavedRouteItem[] = [];
      const seenLines = new Set<string>();

      for (const row of rows) {
        const parsed = parseRow(row);
        if (!parsed) continue;

        for (const option of parsed.options) {
          // Uma linha só pode aparecer uma vez na lista de rotas salvas offline.
          if (seenLines.has(option.lineId)) continue;
          seenLines.add(option.lineId);

          items.push({
            cacheKey: parsed.cacheKey,
            cachedAt: parsed.cachedAt,
            originLabel: parsed.originLabel,
            originLatitude: parsed.originLatitude,
            originLongitude: parsed.originLongitude,
            destinationLabel: parsed.destinationLabel,
            destinationLatitude: parsed.destinationLatitude,
            destinationLongitude: parsed.destinationLongitude,
            option,
          });
        }
      }

      return items;
    });
  },

  async hasOption(
    originLatitude: number,
    originLongitude: number,
    destinationLatitude: number,
    destinationLongitude: number,
    lineId: string,
    boardingStopId: string,
    alightingStopId: string,
  ): Promise<boolean> {
    const cached = await this.find(
      originLatitude,
      originLongitude,
      destinationLatitude,
      destinationLongitude,
    );

    return Boolean(
      cached?.options.some(
        (option) =>
          option.lineId === lineId &&
          option.boardingStop.id === boardingStopId &&
          option.alightingStop.id === alightingStopId,
      ),
    );
  },

  async hasLine(lineId: string): Promise<boolean> {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    return withDatabase(async (db) => {
      const rows = await db.getAllAsync<RouteCacheRow>(
        'SELECT * FROM route_cache WHERE user_id = ?',
        [userId],
      );

      return rows.some((row) => {
        const parsed = parseRow(row);
        return Boolean(parsed?.options.some((option) => option.lineId === lineId));
      });
    });
  },

  async saveUniqueLine(input: OfflineRouteCacheInput, option: RouteOption): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Não foi possível identificar o usuário para salvar a rota offline.');
    }

    const cacheKey = makeCacheKey(
      input.originLatitude,
      input.originLongitude,
      input.destinationLatitude,
      input.destinationLongitude,
    );

    await withDatabase(async (db) => {
      const rows = await db.getAllAsync<RouteCacheRow>(
        'SELECT * FROM route_cache WHERE user_id = ?',
        [userId],
      );

      // Uma linha é uma única rota salva offline para o usuário,
      // independentemente da origem/destino usados na pesquisa.
      for (const row of rows) {
        const parsed = parseRow(row);
        if (!parsed) continue;

        const remaining = parsed.options.filter((item) => item.lineId !== option.lineId);
        if (remaining.length === parsed.options.length) continue;

        if (remaining.length === 0) {
          await db.runAsync(
            'DELETE FROM route_cache WHERE user_id = ? AND cache_key = ?',
            [userId, row.cache_key],
          );
        } else {
          await db.runAsync(
            'UPDATE route_cache SET payload_json = ? WHERE user_id = ? AND cache_key = ?',
            [JSON.stringify(remaining), userId, row.cache_key],
          );
        }
      }

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
          JSON.stringify([option]),
          new Date().toISOString(),
        ],
      );
    });
  },

  async removeLine(lineId: string): Promise<OfflineSavedRouteItem[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    return withDatabase(async (db) => {
      const rows = await db.getAllAsync<RouteCacheRow>(
        'SELECT * FROM route_cache WHERE user_id = ?',
        [userId],
      );
      const removed: OfflineSavedRouteItem[] = [];

      for (const row of rows) {
        const parsed = parseRow(row);
        if (!parsed) continue;

        const matching = parsed.options.filter((option) => option.lineId === lineId);
        if (!matching.length) continue;

        for (const option of matching) {
          removed.push({
            cacheKey: parsed.cacheKey,
            cachedAt: parsed.cachedAt,
            originLabel: parsed.originLabel,
            originLatitude: parsed.originLatitude,
            originLongitude: parsed.originLongitude,
            destinationLabel: parsed.destinationLabel,
            destinationLatitude: parsed.destinationLatitude,
            destinationLongitude: parsed.destinationLongitude,
            option,
          });
        }

        const remaining = parsed.options.filter((option) => option.lineId !== lineId);
        if (remaining.length === 0) {
          await db.runAsync(
            'DELETE FROM route_cache WHERE user_id = ? AND cache_key = ?',
            [userId, row.cache_key],
          );
        } else {
          await db.runAsync(
            'UPDATE route_cache SET payload_json = ? WHERE user_id = ? AND cache_key = ?',
            [JSON.stringify(remaining), userId, row.cache_key],
          );
        }
      }

      return removed;
    });
  },

  async removeOption(
    originLatitude: number,
    originLongitude: number,
    destinationLatitude: number,
    destinationLongitude: number,
    lineId: string,
    boardingStopId: string,
    alightingStopId: string,
  ): Promise<number> {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    const cacheKey = makeCacheKey(
      originLatitude,
      originLongitude,
      destinationLatitude,
      destinationLongitude,
    );

    return withDatabase(async (db) => {
      const row = await db.getFirstAsync<RouteCacheRow>(
        'SELECT * FROM route_cache WHERE user_id = ? AND cache_key = ? LIMIT 1',
        [userId, cacheKey],
      );

      if (!row) return 0;

      const parsed = parseRow(row);
      if (!parsed) return 0;

      const remaining = parsed.options.filter(
        (option) =>
          !(
            option.lineId === lineId &&
            option.boardingStop.id === boardingStopId &&
            option.alightingStop.id === alightingStopId
          ),
      );

      if (remaining.length === parsed.options.length) {
        return remaining.length;
      }

      if (remaining.length === 0) {
        await db.runAsync(
          'DELETE FROM route_cache WHERE user_id = ? AND cache_key = ?',
          [userId, cacheKey],
        );
        return 0;
      }

      await db.runAsync(
        `UPDATE route_cache
         SET payload_json = ?
         WHERE user_id = ? AND cache_key = ?`,
        [JSON.stringify(remaining), userId, cacheKey],
      );

      return remaining.length;
    });
  },
};

function parseRow(row: RouteCacheRow): OfflineRouteCacheItem | null {
  try {
    const options = JSON.parse(row.payload_json) as RouteOption[];
    if (!Array.isArray(options)) return null;

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
}

function makeCacheKey(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
): string {
  return [
    originLat,
    originLng,
    destinationLat,
    destinationLng,
  ]
    .map((value) => value.toFixed(5))
    .join(':');
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
