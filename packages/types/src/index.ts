// Shared types for AgenticOS
// These types are used across API and dashboard packages

export type ProviderName = 'anthropic' | 'openai' | 'azure' | 'vertex' | 'bedrock' | 'ollama' | 'lmstudio' | 'groq' | 'perplexity' | 'mistral';

export type ModelStatus = 'active' | 'beta' | 'deprecated';

export type SessionStatus = 'active' | 'completed' | 'error' | 'cancelled';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type BudgetAlertType = 'daily' | 'weekly' | 'monthly' | 'threshold';

export type BudgetAlertStatus = 'active' | 'triggered' | 'disabled';

export type PipelineStatus = 'draft' | 'active' | 'paused';

export type PipelineNodeType = 'agent' | 'condition' | 'input' | 'output' | 'delay' | 'merge' | 'split';

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

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  rateLimit?: number;
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
  userId: string;
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
  userId: string;
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
  userId: string;
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
}

export interface StreamEvent {
  type: 'content' | 'done' | 'error';
  content?: string;
  usage?: UsageInfo;
}

// Pipeline types

export interface PipelineNode {
  id: string;
  type: PipelineNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
}

export interface PipelineEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'data' | 'control';
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  createdBy: string;
  status: PipelineStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Agent template for marketplace

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string[];
  authorId: string;
  authorName: string;
  rating: number;
  installCount: number;
  config: Partial<Agent>;
  preview?: {
    avatar?: string;
    sampleConversation: ChatMessage[];
  };
  tags: string[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Gamification types

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria: {
    type: 'tokens_saved' | 'cost_reduction' | 'streak' | 'tasks_completed';
    threshold: number;
  };
}

export interface UserStats {
  userId: string;
  totalTokensSaved: number;
  totalCostSaved: number;
  currentStreak: number;
  longestStreak: number;
  tasksCompleted: number;
  badges: string[];
  updatedAt: Date;
}

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
  userId: string;
  startedAt: Date;
  messages: number;
  tokensUsed: number;
  costSoFar: number;
}