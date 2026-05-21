import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';
import { seedProviders, seedModels } from './seed.js';
import { providers, models } from './schema.js';

const DATABASE_URL = process.env.DATABASE_URL || 'file:./data/agentic.db';

const dbPath = DATABASE_URL.replace(/^file:/, '');
const absoluteDbPath = dbPath.startsWith('/') ? dbPath : join(process.cwd(), dbPath);
// Directory the SQLite file lives in — also where the encryption keyfile goes.
export const dbDir = dirname(absoluteDbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(absoluteDbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Resolve the migrations directory relative to this source file.
// In dev (tsx), __dirname is .../apps/api/src/db → ../../drizzle
// After build it lives at .../apps/api/dist/db → ../../drizzle
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '..', '..', 'drizzle');

export async function initDb() {
  console.log('[Database] Running migrations...');
  migrate(db, { migrationsFolder });

  const providerCount = sqlite.prepare('SELECT COUNT(*) as count FROM providers').get() as { count: number };
  if (providerCount.count === 0) {
    console.log('[Database] Seeding providers and models...');
    const insertAll = sqlite.transaction(() => {
      db.insert(providers).values(seedProviders).run();
      db.insert(models).values(seedModels).run();
    });
    insertAll();
    console.log(`[Database] Seeded ${seedProviders.length} providers and ${seedModels.length} models`);
  }

  console.log('[Database] Ready');
}

export { schema };

export type Database = typeof db;
