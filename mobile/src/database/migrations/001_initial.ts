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

  if (version < 3) {
    // Os dados locais pertencem à conta autenticada. As versões anteriores
    // não guardavam o usuário e, portanto, essas linhas antigas não podem ser
    // atribuídas com segurança a uma conta específica. Elas ficam órfãs
    // (não são exibidas) e os novos registros passam a ter user_id.
    await db.execAsync(`
      ALTER TABLE favorites ADD COLUMN user_id TEXT;
      ALTER TABLE search_history ADD COLUMN user_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);

      -- favorite_lines tinha line_id como chave única global. Recriamos a
      -- tabela para permitir a mesma linha favoritada por contas diferentes.
      DROP TABLE IF EXISTS favorite_lines;
      CREATE TABLE favorite_lines (
        user_id TEXT NOT NULL,
        line_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, line_id)
      );
      CREATE INDEX IF NOT EXISTS idx_favorite_lines_user_id ON favorite_lines(user_id);

      PRAGMA user_version = 3;
    `);
  }
}
