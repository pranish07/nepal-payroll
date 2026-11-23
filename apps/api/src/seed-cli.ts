import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDatabase } from './db/client.js';
import { applyMigrations } from './db/migrate.js';
import { countEmployees, seedIfEmpty } from './seed.js';

const dbPath = resolve(process.env.DB_PATH ?? 'data/payroll.db');
mkdirSync(dirname(dbPath), { recursive: true });

const database = createDatabase(dbPath);
applyMigrations(database.raw);
const seeded = seedIfEmpty(database);
const employeeCount = countEmployees(database);
database.raw.close();

if (seeded) {
  console.log(`Seeded demo data into ${dbPath} (${employeeCount} employees).`);
} else {
  console.log(`${dbPath} already contains data; seed skipped.`);
}
