import { secureStorageService } from '../../services/storage/secureStorageService';
import { SECURE_STORE_KEYS } from '../../constants/config';
import { withDatabase } from '../index';
import { CreateFavoriteInput, FavoriteKind, FavoriteLine, FavoritePlace } from '../../types/favorites';

/**
 * Repositório de favoritos: única camada que executa SQL sobre a tabela
 * "favorites". Hooks/telas nunca acessam o banco diretamente.
 */
let favoriteCreateQueue: Promise<void> = Promise.resolve();

async function serializeFavoriteCreate<T>(operation: () => Promise<T>): Promise<T> {
  const previous = favoriteCreateQueue;
  let release!: () => void;
  favoriteCreateQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export const favoritesRepository = {
  async findAll(): Promise<FavoritePlace[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    return withDatabase(async (db) => {
      const rows = await db.getAllAsync<FavoriteRow>(
        'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      return rows.map(mapRowToFavorite);
    });
  },

  async create(input: CreateFavoriteInput): Promise<FavoritePlace> {
    return serializeFavoriteCreate(async () => {
      const userId = await requireCurrentUserId();
      const id = generateId();
      const createdAt = new Date().toISOString();
      const normalizedAddress = normalizeAddress(input.address);
      const storedAddress = input.address.trim().replace(/\s+/g, ' ');

      await withDatabase(async (db) => {
        const existing = await db.getAllAsync<{
          address: string;
          nickname: string;
          address_normalized: string | null;
          latitude: number;
          longitude: number;
        }>(
          'SELECT address, nickname, address_normalized, latitude, longitude FROM favorites WHERE user_id = ? AND kind = ?',
          [userId, input.kind]
        );
        const duplicate = existing.find((row) => {
          const sameAddress = normalizeAddress(row.address) === normalizedAddress
            || row.address_normalized === normalizedAddress;
          const sameCoordinates = coordinatesAreSamePlace(
            row.latitude,
            row.longitude,
            input.coordinates.latitude,
            input.coordinates.longitude,
          );
          return sameAddress || sameCoordinates;
        });
        if (duplicate) {
          const error = new Error('FAVORITE_DUPLICATE');
          (error as Error & { favoriteNickname?: string }).favoriteNickname = duplicate.nickname;
          throw error;
        }

        try {
          await db.runAsync(
            'INSERT INTO favorites (id, user_id, nickname, address, address_normalized, latitude, longitude, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, userId, input.nickname, storedAddress, normalizedAddress, input.coordinates.latitude, input.coordinates.longitude, input.kind, createdAt]
          );
        } catch (error) {
          if (isUniqueFavoriteConstraint(error)) {
            const duplicate = await db.getFirstAsync<{ nickname: string }>(
              'SELECT nickname FROM favorites WHERE user_id = ? AND kind = ? AND (address_normalized = ? OR (ABS(latitude - ?) < 0.0003 AND ABS(longitude - ?) < 0.0003)) LIMIT 1',
              [userId, input.kind, normalizedAddress, input.coordinates.latitude, input.coordinates.longitude]
            );
            const duplicateError = new Error('FAVORITE_DUPLICATE');
            (duplicateError as Error & { favoriteNickname?: string }).favoriteNickname = duplicate?.nickname;
            throw duplicateError;
          }
          throw error;
        }
      });

      return {
        id,
        nickname: input.nickname,
        address: storedAddress,
        latitude: input.coordinates.latitude,
        longitude: input.coordinates.longitude,
        kind: input.kind,
        createdAt,
      };
    });
  },

  async remove(id: string): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      await db.runAsync('DELETE FROM favorites WHERE id = ? AND user_id = ?', [id, userId]);
    });
  },

  async findAllLines(): Promise<FavoriteLine[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    return withDatabase(async (db) => {
      const rows = await db.getAllAsync<{ line_id: string; code: string; name: string }>(
        'SELECT line_id, code, name FROM favorite_lines WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );

      // Versões anteriores podiam ter salvo a mesma linha com IDs diferentes
      // (por exemplo, antes da troca definitiva para o GTFS oficial). Não
      // mostramos duplicatas da mesma linha ao usuário.
      const seen = new Set<string>();
      const unique: FavoriteLine[] = [];
      for (const row of rows) {
        const line = { lineId: row.line_id, code: row.code, name: row.name };
        const key = favoriteLineKey(line);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(line);
      }
      return unique;
    });
  },

  async addLine(line: FavoriteLine): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      const rows = await db.getAllAsync<{ line_id: string; code: string; name: string }>(
        'SELECT line_id, code, name FROM favorite_lines WHERE user_id = ?',
        [userId]
      );
      const key = favoriteLineKey(line);

      // A mesma linha não pode ocupar duas posições só porque recebeu outro
      // lineId. Isso também repara favoritos antigos que apontavam para uma
      // identidade da linha que já não existe na fonte oficial.
      const duplicateIds = rows
        .filter((row) => favoriteLineKey({ lineId: row.line_id, code: row.code, name: row.name }) === key)
        .map((row) => row.line_id);

      for (const duplicateId of duplicateIds) {
        await db.runAsync('DELETE FROM favorite_lines WHERE user_id = ? AND line_id = ?', [userId, duplicateId]);
      }

      await db.runAsync(
        'INSERT OR REPLACE INTO favorite_lines (user_id, line_id, code, name, created_at) VALUES (?, ?, ?, ?, ?)',
        [userId, line.lineId, line.code, line.name, new Date().toISOString()]
      );
    });
  },

  async removeLine(line: FavoriteLine): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      const rows = await db.getAllAsync<{ line_id: string; code: string; name: string }>(
        'SELECT line_id, code, name FROM favorite_lines WHERE user_id = ?',
        [userId]
      );
      const key = favoriteLineKey(line);
      const ids = rows
        .filter((row) => row.line_id === line.lineId || favoriteLineKey({ lineId: row.line_id, code: row.code, name: row.name }) === key)
        .map((row) => row.line_id);

      for (const lineId of ids) {
        await db.runAsync('DELETE FROM favorite_lines WHERE user_id = ? AND line_id = ?', [userId, lineId]);
      }
    });
  },
};

interface FavoriteRow {
  id: string;
  user_id: string | null;
  nickname: string;
  address: string;
  latitude: number;
  longitude: number;
  kind: string;
  created_at: string;
}

function mapRowToFavorite(row: FavoriteRow): FavoritePlace {
  return {
    id: row.id,
    nickname: row.nickname,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    kind: (row.kind as FavoriteKind) ?? 'other',
    createdAt: row.created_at,
  };
}

function normalizeAddress(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeLinePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function favoriteLineKey(line: FavoriteLine): string {
  return `${normalizeLinePart(line.code)}\u0000${normalizeLinePart(line.name)}`;
}

function coordinatesAreSamePlace(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): boolean {
  const tolerance = 0.0003;
  return Math.abs(latitudeA - latitudeB) < tolerance
    && Math.abs(longitudeA - longitudeB) < tolerance;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isUniqueFavoriteConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('UNIQUE constraint failed') && message.includes('favorites');
}

async function getCurrentUserId(): Promise<string | null> {
  const user = await secureStorageService.getObject<{ id?: string }>(SECURE_STORE_KEYS.USER);
  return user?.id ?? null;
}

async function requireCurrentUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('USER_NOT_AUTHENTICATED');
  return userId;
}
