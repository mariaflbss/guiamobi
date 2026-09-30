import { secureStorageService } from '../../services/storage/secureStorageService';
import { SECURE_STORE_KEYS } from '../../constants/config';
import { withDatabase } from '../index';
import { CreateHistoryInput, SearchHistoryItem } from '../../types/favorites';
import { MAX_HISTORY_ITEMS } from '../../constants/config';

/**
 * Repositório do histórico de pesquisas (US07).
 * Mantém sempre no máximo MAX_HISTORY_ITEMS registros, removendo os mais
 * antigos automaticamente a cada nova inserção.
 */
export const historyRepository = {
  async findRecent(limit: number = MAX_HISTORY_ITEMS): Promise<SearchHistoryItem[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    return withDatabase(async (db) => {
      const rows = await db.getAllAsync<HistoryRow>(
        'SELECT * FROM search_history WHERE user_id = ? ORDER BY searched_at DESC, rowid DESC LIMIT ?',
        [userId, limit]
      );
      return rows.map(mapRowToHistory);
    });
  },

  async findLast(): Promise<SearchHistoryItem | null> {
    const items = await this.findRecent(1);
    return items[0] ?? null;
  },

  async create(input: CreateHistoryInput): Promise<SearchHistoryItem> {
    const userId = await requireCurrentUserId();
    const id = generateId();
    const searchedAt = new Date().toISOString();

    await withDatabase(async (db) => {
      await db.runAsync(
        `INSERT INTO search_history
          (id, user_id, origin_label, origin_latitude, origin_longitude, destination_label, destination_latitude, destination_longitude, searched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          input.originLabel,
          input.originCoordinates.latitude,
          input.originCoordinates.longitude,
          input.destinationLabel,
          input.destinationCoordinates.latitude,
          input.destinationCoordinates.longitude,
          searchedAt,
        ]
      );

      // Mantém apenas os MAX_HISTORY_ITEMS registros mais recentes (US07)
      await db.runAsync(
        `DELETE FROM search_history WHERE user_id = ? AND id NOT IN (
           SELECT id FROM search_history WHERE user_id = ? ORDER BY searched_at DESC, rowid DESC LIMIT ?
         )`,
        [userId, userId, MAX_HISTORY_ITEMS]
      );
    });

    return {
      id,
      originLabel: input.originLabel,
      originLatitude: input.originCoordinates.latitude,
      originLongitude: input.originCoordinates.longitude,
      destinationLabel: input.destinationLabel,
      destinationLatitude: input.destinationCoordinates.latitude,
      destinationLongitude: input.destinationCoordinates.longitude,
      searchedAt,
      lineCode: null,
      durationMinutes: null,
    };
  },

  /** Registra a linha escolhida pelo usuário na busca (mostrada no histórico). */
  async setChosenLine(id: string, lineCode: string, durationMinutes: number): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      await db.runAsync('UPDATE search_history SET line_code = ?, duration_minutes = ? WHERE id = ? AND user_id = ?', [
        lineCode,
        durationMinutes,
        id,
        userId,
      ]);
    });
  },

  async clear(): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      await db.runAsync('DELETE FROM search_history WHERE user_id = ?', [userId]);
    });
  },
};

interface HistoryRow {
  id: string;
  user_id: string | null;
  origin_label: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_label: string;
  destination_latitude: number;
  destination_longitude: number;
  searched_at: string;
  line_code: string | null;
  duration_minutes: number | null;
}

function mapRowToHistory(row: HistoryRow): SearchHistoryItem {
  return {
    id: row.id,
    originLabel: row.origin_label,
    originLatitude: row.origin_latitude,
    originLongitude: row.origin_longitude,
    destinationLabel: row.destination_label,
    destinationLatitude: row.destination_latitude,
    destinationLongitude: row.destination_longitude,
    searchedAt: row.searched_at,
    lineCode: row.line_code,
    durationMinutes: row.duration_minutes,
  };
}

function generateId(): string {
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
