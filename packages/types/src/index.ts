// Shared types for AgenticOS
// These types are used across API and dashboard packages

export type ProviderName = 'anthropic' | 'openai' | 'azure' | 'vertex' | 'bedrock' | 'ollama' | 'lmstudio' | 'groq' | 'perplexity' | 'mistral';

export type ModelStatus = 'active' | 'beta' | 'deprecated';

export type SessionStatus = 'active' | 'completed' | 'error' | 'cancelled';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type BudgetAlertType = 'daily' | 'weekly' | 'monthly' | 'threshold';

export type BudgetAlertStatus = 'active' | 'triggered' | 'disabled';

export interface Provider {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  isLocal: boolean;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export interface Model {
  id: string;
  providerId: string;
  name: string;
  displayName: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  status: ModelStatus;
  metadata: Record<string, unknown>;
}

export interface AgentPersona {
  tone: 'professional' | 'casual' | 'technical' | 'creative';
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  knowledgeBases: string[];
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  rateLimit?: number;
}

// Backwards-compatible alias; prefer `Tool` going forward.
export type ToolDefinition = Tool;

export interface ToolCall {
  id: string; // provider-assigned id; tool results reference it
  name: string;
  arguments: string; // JSON string
}

export interface ToolResult {
  name: string;
  content: string;
  isError?: boolean;
}

export interface AgentMemoryConfig {
  strategy: 'sliding_window' | 'summary' | 'full';
  maxMessages: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  persona: AgentPersona;
  tools: ToolDefinition[];
  defaultModelId: string;
  fallbackModelId?: string;
  memoryConfig: AgentMemoryConfig;
  rateLimit: number;
  createdBy: string;
  isTemplate: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  agentId: string;
  modelId: string;
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date;
  metadata: Record<string, unknown>;
}

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  tokenCount?: number;
  modelId: string;
  latencyMs: number;
  costUsd: number;
  parentMessageId?: string;
  createdAt: Date;
}

export interface UsageRecord {
  id: string;
  agentId: string;
  modelId: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
  avgLatencyMs: number;
  createdAt: Date;
}

export interface BudgetAlert {
  id: string;
  type: BudgetAlertType;
  limitUsd: number;
  currentSpend: number;
  notifiedAt?: Date;
  status: BudgetAlertStatus;
}

// LLM Provider interfaces

export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  // Set on an assistant message that requested tool calls.
  toolCalls?: ToolCall[];
  // Set on a tool-role message; references the ToolCall.id it answers.
  toolCallId?: string;
}

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  streaming?: boolean;
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_use' | 'error';
  usage: UsageInfo;
  latencyMs: number;
  costUsd: number;
  raw: unknown;
  // Populated when finishReason === 'tool_use' — the tool calls the model wants run.
  toolCalls?: ToolCall[];
}

// High-level stream event covering both the legacy union shape and the
// discriminated variants in StreamEventType.
export interface StreamEvent {
  type: 'content' | 'done' | 'error';
  content?: string;
  usage?: UsageInfo;
  finishReason?: string;
  error?: string;
}

// Discriminated stream event used by provider implementations
export interface ContentDeltaEvent {
  type: 'content';
  content: string;
}

export interface DoneStreamEvent {
  type: 'done';
  usage: UsageInfo;
  finishReason: string;
}

export interface ErrorStreamEvent {
  type: 'error';
  error: string;
}

export type StreamEventType = ContentDeltaEvent | DoneStreamEvent | ErrorStreamEvent;

// API Response types

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Dashboard specific types

export interface DashboardMetrics {
  totalSpend: {
    today: number;
    week: number;
    month: number;
  };
  activeSessions: number;
  topAgents: Array<{
    agentId: string;
    name: string;
    requestCount: number;
  }>;
  costTrend: Array<{
    date: string;
    cost: number;
  }>;
  tokenDistribution: Array<{
    model: string;
    tokens: number;
  }>;
}

export interface LiveSession {
  id: string;
  agentId: string;
  agentName: string;
  startedAt: Date;
  messages: number;
  tokensUsed: number;
  costSoFar: number;
}

export * from './context.js';