import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));

/**
 * Committed SQL migrations, applied in filename order. A migration is recorded
 * only after its statements commit, so a failed migration is retried next boot.
 */
export function applyMigrations(raw: Database.Database): string[] {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    raw
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );
  const newlyApplied: string[] = [];

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(`${migrationsDir}${file}`, 'utf8');
    raw.transaction(() => {
      raw.exec(sql);
      raw.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    })();
    newlyApplied.push(file);
  }
  return newlyApplied;
}
