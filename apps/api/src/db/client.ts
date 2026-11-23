import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export interface AppDatabase {
  raw: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  path: string;
}

/**
 * Opens SQLite with the production safety settings. WAL is skipped for
 * in-memory test databases, where it has no meaning.
 */
export function createDatabase(path: string): AppDatabase {
  const raw = new Database(path);
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  if (path !== ':memory:') {
    raw.pragma('journal_mode = WAL');
  }
  return { raw, db: drizzle(raw, { schema }), path };
}

export function closeDatabase(database: AppDatabase): void {
  database.raw.close();
}
