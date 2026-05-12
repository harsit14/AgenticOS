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
  createdBy: text('created_by').notNull(),
  isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Sessions - Active conversations with agents
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  userId: text('user_id').notNull(),
  modelId: text('model_id').notNull().references(() => models.id),
  status: text('status', { enum: ['active', 'completed', 'error', 'cancelled'] }).notNull().default('active'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
});

// Messages - Individual messages in a session
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  modelId: text('model_id').notNull().references(() => models.id),
  latencyMs: integer('latency_ms').notNull(),
  costUsd: real('cost_usd').notNull(),
  parentMessageId: text('parent_message_id').references(() => messages.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Usage Records - Aggregated usage for analytics
export const usageRecords = sqliteTable('usage_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
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
  userId: text('user_id').notNull(),
  type: text('type', { enum: ['daily', 'weekly', 'monthly', 'threshold'] }).notNull(),
  limitUsd: real('limit_usd').notNull(),
  currentSpend: real('current_spend').notNull().default(0),
  notifiedAt: integer('notified_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['active', 'triggered', 'disabled'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Agent Templates - Marketplace templates for agents
export const agentTemplates = sqliteTable('agent_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category', { mode: 'json' }).$type<string[]>().notNull().default([]),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  rating: real('rating').notNull().default(0),
  installCount: integer('install_count').notNull().default(0),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  previewAvatar: text('preview_avatar'),
  sampleConversation: text('sample_conversation', { mode: 'json' }).$type<Array<{
    role: string;
    content: string;
  }>>(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Pipelines - Multi-agent workflow definitions
export const pipelines = sqliteTable('pipelines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  nodes: text('nodes', { mode: 'json' }).$type<Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    config: Record<string, unknown>;
    inputs: string[];
    outputs: string[];
  }>>().notNull().default([]),
  edges: text('edges', { mode: 'json' }).$type<Array<{
    id: string;
    sourceId: string;
    targetId: string;
    type: 'data' | 'control';
  }>>().notNull().default([]),
  createdBy: text('created_by').notNull(),
  status: text('status', { enum: ['draft', 'active', 'paused'] }).notNull().default('draft'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Pipeline Executions - Track pipeline runs
export const pipelineExecutions = sqliteTable('pipeline_executions', {
  id: text('id').primaryKey(),
  pipelineId: text('pipeline_id').notNull().references(() => pipelines.id),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  triggerType: text('trigger_type', { enum: ['manual', 'scheduled', 'api', 'webhook'] }).notNull().default('manual'),
  input: text('input', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  output: text('output', { mode: 'json' }).$type<Record<string, unknown>>(),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Node Executions - Track individual node runs
export const nodeExecutions = sqliteTable('node_executions', {
  id: text('id').primaryKey(),
  executionId: text('execution_id').notNull().references(() => pipelineExecutions.id),
  nodeId: text('node_id').notNull(),
  status: text('status', { enum: ['idle', 'running', 'success', 'error', 'skipped'] }).notNull().default('idle'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  input: text('input', { mode: 'json' }).$type<unknown>(),
  output: text('output', { mode: 'json' }).$type<unknown>(),
  error: text('error'),
  latencyMs: integer('latency_ms').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// User Stats - Gamification stats
export const userStats = sqliteTable('user_stats', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  totalTokensSaved: integer('total_tokens_saved').notNull().default(0),
  totalCostSaved: real('total_cost_saved').notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  tasksCompleted: integer('tasks_completed').notNull().default(0),
  badges: text('badges', { mode: 'json' }).$type<string[]>().notNull().default([]),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Settings - User preferences
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  theme: text('theme', { enum: ['light', 'dark', 'system'] }).notNull().default('dark'),
  defaultModelId: text('default_model_id').references(() => models.id),
  rateLimit: integer('rate_limit').notNull().default(100),
  budgetAlertsEnabled: integer('budget_alerts_enabled', { mode: 'boolean' }).notNull().default(true),
  systemPromptTemplates: text('system_prompt_templates', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Types for insert operations
export type ProviderInsert = typeof providers.$inferInsert;
export type ModelInsert = typeof models.$inferInsert;
export type AgentInsert = typeof agents.$inferInsert;
export type SessionInsert = typeof sessions.$inferInsert;
export type MessageInsert = typeof messages.$inferInsert;
export type UsageRecordInsert = typeof usageRecords.$inferInsert;
export type BudgetAlertInsert = typeof budgetAlerts.$inferInsert;
export type AgentTemplateInsert = typeof agentTemplates.$inferInsert;
export type PipelineInsert = typeof pipelines.$inferInsert;
export type PipelineExecutionInsert = typeof pipelineExecutions.$inferInsert;
export type NodeExecutionInsert = typeof nodeExecutions.$inferInsert;
export type UserStatsInsert = typeof userStats.$inferInsert;
export type SettingsInsert = typeof settings.$inferInsert;

// Types for select operations
export type ProviderSelect = typeof providers.$inferSelect;
export type ModelSelect = typeof models.$inferSelect;
export type AgentSelect = typeof agents.$inferSelect;
export type SessionSelect = typeof sessions.$inferSelect;
export type MessageSelect = typeof messages.$inferSelect;
export type UsageRecordSelect = typeof usageRecords.$inferSelect;
export type BudgetAlertSelect = typeof budgetAlerts.$inferSelect;
export type AgentTemplateSelect = typeof agentTemplates.$inferSelect;
export type PipelineSelect = typeof pipelines.$inferSelect;
export type PipelineExecutionSelect = typeof pipelineExecutions.$inferSelect;
export type NodeExecutionSelect = typeof nodeExecutions.$inferSelect;
export type UserStatsSelect = typeof userStats.$inferSelect;
export type SettingsSelect = typeof settings.$inferSelect;