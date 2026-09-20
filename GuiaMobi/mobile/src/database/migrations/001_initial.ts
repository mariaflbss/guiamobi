import * as SQLite from 'expo-sqlite';

/**
 * Migrações do banco local (favoritos e histórico - US07), versionadas com
 * PRAGMA user_version para rodar cada etapa uma única vez, inclusive em
 * aparelhos que já tinham o banco da versão anterior.
 */
export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY NOT NULL,
        nickname TEXT NOT NULL,
        address TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS search_history (
        id TEXT PRIMARY KEY NOT NULL,
        origin_label TEXT NOT NULL,
        origin_latitude REAL NOT NULL,
        origin_longitude REAL NOT NULL,
        destination_label TEXT NOT NULL,
        destination_latitude REAL NOT NULL,
        destination_longitude REAL NOT NULL,
        searched_at TEXT NOT NULL
      );

      PRAGMA user_version = 1;
    `);
  }

  if (version < 2) {
    // Tipo do favorito (ícone/cor), linha e duração escolhidas no histórico,
    // e linhas favoritas (seção "Linhas favoritas" dos mockups).
    await db.execAsync(`
      ALTER TABLE favorites ADD COLUMN kind TEXT NOT NULL DEFAULT 'other';
      ALTER TABLE search_history ADD COLUMN line_code TEXT;
      ALTER TABLE search_history ADD COLUMN duration_minutes INTEGER;

      CREATE TABLE IF NOT EXISTS favorite_lines (
        line_id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      PRAGMA user_version = 2;
    `);
  }
}
