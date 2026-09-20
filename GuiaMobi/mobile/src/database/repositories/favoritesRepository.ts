import { getDatabase } from '../index';
import { CreateFavoriteInput, FavoriteKind, FavoriteLine, FavoritePlace } from '../../types/favorites';

/**
 * Repositório de favoritos: única camada que executa SQL sobre a tabela
 * "favorites". Hooks/telas nunca acessam o banco diretamente.
 */
export const favoritesRepository = {
  async findAll(): Promise<FavoritePlace[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<FavoriteRow>('SELECT * FROM favorites ORDER BY created_at DESC');
    return rows.map(mapRowToFavorite);
  },

  async create(input: CreateFavoriteInput): Promise<FavoritePlace> {
    const db = await getDatabase();
    const id = generateId();
    const createdAt = new Date().toISOString();

    await db.runAsync(
      'INSERT INTO favorites (id, nickname, address, latitude, longitude, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, input.nickname, input.address, input.coordinates.latitude, input.coordinates.longitude, input.kind, createdAt]
    );

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
    const db = await getDatabase();
    await db.runAsync('DELETE FROM favorites WHERE id = ?', [id]);
  },

  async findAllLines(): Promise<FavoriteLine[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ line_id: string; code: string; name: string }>(
      'SELECT line_id, code, name FROM favorite_lines ORDER BY created_at DESC'
    );
    return rows.map((row) => ({ lineId: row.line_id, code: row.code, name: row.name }));
  },

  async addLine(line: FavoriteLine): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'INSERT OR REPLACE INTO favorite_lines (line_id, code, name, created_at) VALUES (?, ?, ?, ?)',
      [line.lineId, line.code, line.name, new Date().toISOString()]
    );
  },

  async removeLine(lineId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM favorite_lines WHERE line_id = ?', [lineId]);
  },
};

interface FavoriteRow {
  id: string;
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
