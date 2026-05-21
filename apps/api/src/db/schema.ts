import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Providers - LLM provider configurations
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKeyEnvVar: text('api_key_env_var').notNull(),
  isLocal: integer('is_local', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Models - Available LLM models per provider
export const models = sqliteTable('models', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => providers.id),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  contextWindow: integer('context_window').notNull(),
  inputCostPer1M: real('input_cost_per_1m').notNull(),
  outputCostPer1M: real('output_cost_per_1m').notNull(),
  supportsStreaming: integer('supports_streaming', { mode: 'boolean' }).notNull().default(true),
  supportsVision: integer('supports_vision', { mode: 'boolean' }).notNull().default(false),
  supportsFunctionCalling: integer('supports_function_calling', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['active', 'beta', 'deprecated'] }).notNull().default('active'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Agents - Configurable AI agents
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  persona: text('persona', { mode: 'json' }).$type<{
    tone: 'professional' | 'casual' | 'technical' | 'creative';
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    knowledgeBases: string[];
  }>().notNull(),
  tools: text('tools', { mode: 'json' }).$type<Array<{
    id: string;
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    requiresApproval: boolean;
    rateLimit?: number;
  }>>().notNull().default([]),
  defaultModelId: text('default_model_id').notNull().references(() => models.id),
  fallbackModelId: text('fallback_model_id').references(() => models.id),
  memoryConfig: text('memory_config', { mode: 'json' }).$type<{
    strategy: 'sliding_window' | 'summary' | 'full';
    maxMessages: number;
  }>().notNull().default({ strategy: 'sliding_window', maxMessages: 50 }),
  rateLimit: integer('rate_limit').notNull().default(60),
  createdBy: text('created_by').notNull().default('local'),
  isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Sessions - Active conversations with agents
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  modelId: text('model_id').notNull().references(() => models.id),
  status: text('status', { enum: ['active', 'completed', 'error', 'cancelled'] }).notNull().default('active'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
});

// Messages - Individual messages in a session.
// parentMessageId references the same table; we declare the column without
// the .references() so TypeScript can infer the table type, and rely on the
// FK declared in the migration (drizzle 0.33 can't infer self-references).
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  modelId: text('model_id').notNull().references(() => models.id),
  latencyMs: integer('latency_ms').notNull(),
  costUsd: real('cost_usd').notNull(),
  parentMessageId: text('parent_message_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Usage Records - Aggregated usage for analytics
export const usageRecords = sqliteTable('usage_records', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  modelId: text('model_id').notNull().references(() => models.id),
  date: text('date').notNull(), // YYYY-MM-DD format
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  requestCount: integer('request_count').notNull().default(0),
  avgLatencyMs: real('avg_latency_ms').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Budget Alerts - Cost threshold notifications
export const budgetAlerts = sqliteTable('budget_alerts', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['daily', 'weekly', 'monthly', 'threshold'] }).notNull(),
  limitUsd: real('limit_usd').notNull(),
  currentSpend: real('current_spend').notNull().default(0),
  notifiedAt: integer('notified_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['active', 'triggered', 'disabled'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Settings - Key/value store for single-user configuration
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Types for insert operations
export type ProviderInsert = typeof providers.$inferInsert;
export type ModelInsert = typeof models.$inferInsert;
export type AgentInsert = typeof agents.$inferInsert;
export type SessionInsert = typeof sessions.$inferInsert;
export type MessageInsert = typeof messages.$inferInsert;
export type UsageRecordInsert = typeof usageRecords.$inferInsert;
export type BudgetAlertInsert = typeof budgetAlerts.$inferInsert;
export type SettingsInsert = typeof settings.$inferInsert;

// Types for select operations
export type ProviderSelect = typeof providers.$inferSelect;
export type ModelSelect = typeof models.$inferSelect;
export type AgentSelect = typeof agents.$inferSelect;
export type SessionSelect = typeof sessions.$inferSelect;
export type MessageSelect = typeof messages.$inferSelect;
export type UsageRecordSelect = typeof usageRecords.$inferSelect;
export type BudgetAlertSelect = typeof budgetAlerts.$inferSelect;
export type SettingsSelect = typeof settings.$inferSelect;
