import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations/001_initial';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitialization: Promise<SQLite.SQLiteDatabase> | null = null;
let dbOperationQueue: Promise<void> = Promise.resolve();

/**
 * Retorna a instância única do banco SQLite local, garantindo que as
 * migrações já foram executadas antes de qualquer uso (US07 - favoritos e
 * histórico persistidos localmente no dispositivo).
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  // Single-flight: chamadas concorrentes compartilham a mesma abertura e
  // migração, evitando múltiplas instâncias nativas e migrações simultâneas.
  if (!dbInitialization) {
    dbInitialization = initializeDatabase();
  }

  try {
    return await dbInitialization;
  } catch (error) {
    // Permite uma nova tentativa se a inicialização falhar.
    dbInitialization = null;
    throw error;
  }
}

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('guiamobi.db');
  await runMigrations(db);
  dbInstance = db;
  return db;
}


/**
 * Serializa operações sobre a instância nativa do SQLite. Isso evita que
 * leituras/refetches do React Query concorram com INSERT/DELETE em versões
 * do expo-sqlite que podem rejeitar prepareAsync sob concorrência.
 */
export async function withDatabase<T>(
  operation: (db: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const run = dbOperationQueue.then(async () => operation(await getDatabase()));
  dbOperationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
