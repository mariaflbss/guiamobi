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

  if (version < 4) {
    // Regra US07: a mesma conta não pode cadastrar o mesmo endereço na mesma
    // categoria mais de uma vez, mesmo usando apelidos diferentes.
    await db.execAsync(`
      ALTER TABLE favorites ADD COLUMN address_normalized TEXT NOT NULL DEFAULT '';

      UPDATE favorites
      SET address_normalized = lower(trim(replace(replace(replace(replace(address, '.', ' '), ',', ' '), '-', ' '), '  ', ' ')));

      -- Remove duplicidades antigas antes de criar a restrição. Mantém o
      -- registro mais antigo de cada combinação válida.
      DELETE FROM favorites
      WHERE user_id IS NOT NULL
        AND rowid NOT IN (
          SELECT MIN(rowid)
          FROM favorites
          WHERE user_id IS NOT NULL
          GROUP BY user_id, kind, address_normalized
        );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_user_kind_address
        ON favorites(user_id, kind, address_normalized);

      PRAGMA user_version = 4;
    `);
  }


  if (version < 5) {
    // Reforça a regra de unicidade usando exatamente a mesma normalização
    // aplicada no cadastro. A versão 4 usava uma normalização SQL que não
    // removia acentos e podia deixar passar endereços equivalentes.
    const rows = await db.getAllAsync<{ rowid: number; user_id: string | null; kind: string; address: string }>(
      'SELECT rowid, user_id, kind, address FROM favorites'
    );

    const seen = new Set<string>();
    const duplicateRowIds: number[] = [];

    for (const row of rows) {
      const normalized = normalizeFavoriteAddress(row.address);
      await db.runAsync(
        'UPDATE favorites SET address_normalized = ? WHERE rowid = ?',
        [normalized, row.rowid]
      );

      if (!row.user_id) continue;
      const key = `${row.user_id}\u0000${row.kind}\u0000${normalized}`;
      if (seen.has(key)) duplicateRowIds.push(row.rowid);
      else seen.add(key);
    }

    for (const rowid of duplicateRowIds) {
      await db.runAsync('DELETE FROM favorites WHERE rowid = ?', [rowid]);
    }

    await db.execAsync(`
      DROP INDEX IF EXISTS uq_favorites_user_kind_address;
      CREATE UNIQUE INDEX uq_favorites_user_kind_address
        ON favorites(user_id, kind, address_normalized);
      PRAGMA user_version = 5;
    `);
  }

  if (version < 6) {
    // Cache persistente de rotas e horários já consultados (US16).
    // O payload guarda também paradas e traçado retornados pela API, permitindo
    // reabrir a rota e o mapa sem uma nova requisição imediata.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS route_cache (
        user_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        origin_label TEXT NOT NULL,
        origin_latitude REAL NOT NULL,
        origin_longitude REAL NOT NULL,
        destination_label TEXT NOT NULL,
        destination_latitude REAL NOT NULL,
        destination_longitude REAL NOT NULL,
        payload_json TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (user_id, cache_key)
      );

      CREATE INDEX IF NOT EXISTS idx_route_cache_user_cached_at
        ON route_cache(user_id, cached_at DESC);

      PRAGMA user_version = 6;
    `);
  }
}


function normalizeFavoriteAddress(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
