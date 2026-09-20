import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations/001_initial';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Retorna a instância única do banco SQLite local, garantindo que as
 * migrações já foram executadas antes de qualquer uso (US07 - favoritos e
 * histórico persistidos localmente no dispositivo).
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  const db = await SQLite.openDatabaseAsync('guiamobi.db');
  await runMigrations(db);
  dbInstance = db;

  return dbInstance;
}
