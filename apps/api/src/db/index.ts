import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as schema from './schema.js';
import { seedProviders, seedModels } from './seed.js';

const DATABASE_URL = process.env.DATABASE_URL || 'file:./data/agentic.db';

// Ensure data directory exists
const dbPath = DATABASE_URL.replace('file:', '');
const dbDir = join(process.cwd(), dbPath, '..');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Create SQLite connection
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Initialize database with schema and seed data
export async function initDb() {
  console.log('[Database] Initializing...');

  // Create tables manually since we're using raw SQLite
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_env_var TEXT NOT NULL,
      is_local INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id),
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      context_window INTEGER NOT NULL,
      input_cost_per_1m REAL NOT NULL,
      output_cost_per_1m REAL NOT NULL,
      supports_streaming INTEGER NOT NULL DEFAULT 1,
      supports_vision INTEGER NOT NULL DEFAULT 0,
      supports_function_calling INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      persona TEXT NOT NULL,
      tools TEXT NOT NULL DEFAULT '[]',
      default_model_id TEXT NOT NULL REFERENCES models(id),
      fallback_model_id TEXT REFERENCES models(id),
      memory_config TEXT NOT NULL DEFAULT '{"strategy":"sliding_window","maxMessages":50}',
      rate_limit INTEGER NOT NULL DEFAULT 60,
      created_by TEXT NOT NULL,
      is_template INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      user_id TEXT NOT NULL,
      model_id TEXT NOT NULL REFERENCES models(id),
      status TEXT NOT NULL DEFAULT 'active',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      model_id TEXT NOT NULL REFERENCES models(id),
      latency_ms INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      parent_message_id TEXT REFERENCES messages(id),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      model_id TEXT NOT NULL REFERENCES models(id),
      date TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      avg_latency_ms REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      limit_usd REAL NOT NULL,
      current_spend REAL NOT NULL DEFAULT 0,
      notified_at INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '[]',
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      rating REAL NOT NULL DEFAULT 0,
      install_count INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL,
      preview_avatar TEXT,
      sample_conversation TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      nodes TEXT NOT NULL DEFAULT '[]',
      edges TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      total_tokens_saved INTEGER NOT NULL DEFAULT 0,
      total_cost_saved REAL NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      badges TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      theme TEXT NOT NULL DEFAULT 'dark',
      default_model_id TEXT REFERENCES models(id),
      rate_limit INTEGER NOT NULL DEFAULT 100,
      budget_alerts_enabled INTEGER NOT NULL DEFAULT 1,
      system_prompt_templates TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
    CREATE INDEX IF NOT EXISTS idx_agents_created_by ON agents(created_by);
    CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_usage_records_date ON usage_records(date);
    CREATE INDEX IF NOT EXISTS idx_usage_records_user ON usage_records(user_id);
  `);

  // Check if we need to seed
  const providerCount = sqlite.prepare('SELECT COUNT(*) as count FROM providers').get() as { count: number };

  if (providerCount.count === 0) {
    console.log('[Database] Seeding providers and models...');

    const insertProvider = sqlite.prepare(`
      INSERT INTO providers (id, name, display_name, base_url, api_key_env_var, is_local, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertModel = sqlite.prepare(`
      INSERT INTO models (id, provider_id, name, display_name, context_window, input_cost_per_1m, output_cost_per_1m, supports_streaming, supports_vision, supports_function_calling, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = sqlite.transaction(() => {
      for (const provider of seedProviders) {
        insertProvider.run(
          provider.id,
          provider.name,
          provider.displayName,
          provider.baseUrl,
          provider.apiKeyEnvVar,
          provider.isLocal ? 1 : 0,
          provider.status,
          provider.createdAt.getTime(),
          provider.updatedAt.getTime()
        );
      }

      for (const model of seedModels) {
        insertModel.run(
          model.id,
          model.providerId,
          model.name,
          model.displayName,
          model.contextWindow,
          model.inputCostPer1M,
          model.outputCostPer1M,
          model.supportsStreaming ? 1 : 0,
          model.supportsVision ? 1 : 0,
          model.supportsFunctionCalling ? 1 : 0,
          model.status,
          JSON.stringify(model.metadata || {}),
          model.createdAt.getTime(),
          model.updatedAt.getTime()
        );
      }
    });

    insertMany();
    console.log(`[Database] Seeded ${seedProviders.length} providers and ${seedModels.length} models`);
  }

  console.log('[Database] Initialized successfully');
}

// Export schema for use in queries
export { schema };

export type Database = typeof db;