import { secureStorageService } from '../../services/storage/secureStorageService';
import { SECURE_STORE_KEYS } from '../../constants/config';
import { withDatabase } from '../index';
import { CreateFavoriteInput, FavoriteKind, FavoriteLine, FavoritePlace } from '../../types/favorites';

/**
 * Repositório de favoritos: única camada que executa SQL sobre a tabela
 * "favorites". Hooks/telas nunca acessam o banco diretamente.
 */
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
    const userId = await requireCurrentUserId();
    const id = generateId();
    const createdAt = new Date().toISOString();

    await withDatabase(async (db) => {
      await db.runAsync(
        'INSERT INTO favorites (id, user_id, nickname, address, latitude, longitude, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, userId, input.nickname, input.address, input.coordinates.latitude, input.coordinates.longitude, input.kind, createdAt]
      );
    });

    return {
      id,
      nickname: input.nickname,
      address: input.address,
      latitude: input.coordinates.latitude,
      longitude: input.coordinates.longitude,
      kind: input.kind,
      createdAt,
    };
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
      return rows.map((row) => ({ lineId: row.line_id, code: row.code, name: row.name }));
    });
  },

  async addLine(line: FavoriteLine): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      await db.runAsync(
        'INSERT OR REPLACE INTO favorite_lines (user_id, line_id, code, name, created_at) VALUES (?, ?, ?, ?, ?)',
        [userId, line.lineId, line.code, line.name, new Date().toISOString()]
      );
    });
  },

  async removeLine(lineId: string): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      await db.runAsync('DELETE FROM favorite_lines WHERE user_id = ? AND line_id = ?', [userId, lineId]);
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

function generateId(): string {
  // Identificador simples o suficiente para uso local (sem colisão prática
  // no volume de dados de um único usuário/dispositivo).
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}


async function getCurrentUserId(): Promise<string | null> {
  const user = await secureStorageService.getObject<{ id?: string }>(SECURE_STORE_KEYS.USER);
  return user?.id ?? null;
}

async function requireCurrentUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Usuário não autenticado.');
  return userId;
}
