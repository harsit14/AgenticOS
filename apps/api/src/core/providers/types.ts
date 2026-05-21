import type {
  ChatMessage,
  ChatParams,
  ChatResponse,
  StreamEvent,
  StreamEventType,
  Tool,
  ToolCall,
  ToolResult,
  UsageInfo,
} from '@agentic-os/types';

// Re-export shared shapes so existing imports from this file keep working.
export type {
  ChatMessage,
  ChatParams,
  ChatResponse,
  StreamEvent,
  StreamEventType,
  Tool,
  ToolCall,
  ToolResult,
  UsageInfo,
};

// Provider configuration
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

// Base interface all providers must implement
export interface LLMProvider {
  readonly providerId: string;
  readonly providerName: string;

  chat(params: ChatParams): Promise<ChatResponse>;
  streamChat(params: ChatParams): AsyncGenerator<StreamEvent>;
  embed(texts: string[]): Promise<EmbeddingResponse>;
  ping(): Promise<boolean>;
  getInfo(): ProviderInfo;
}

export interface ProviderInfo {
  id: string;
  name: string;
  isLocal: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  maxContextWindow: number;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  usage: UsageInfo;
  model: string;
}

// Model pricing for cost calculation
export interface ModelPricing {
  providerId: string;
  modelId: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

// Rate limiter interface
export interface RateLimiter {
  acquire(providerId: string): Promise<boolean>;
  release(providerId: string): void;
  getWaitTime(providerId: string): number;
}

// Runtime error classes — kept in the API package because they're thrown/caught here.
export class LLMError extends Error {
  constructor(
    message: string,
    public code: string,
    public providerId: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class RateLimitError extends LLMError {
  constructor(providerId: string, public retryAfterMs?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT', providerId, 429, true);
    this.name = 'RateLimitError';
  }
}

export class ContextLengthError extends LLMError {
  constructor(providerId: string, public maxTokens: number, public usedTokens: number) {
    super(
      `Context length exceeded: ${usedTokens} > ${maxTokens}`,
      'CONTEXT_LENGTH',
      providerId,
      400,
      false
    );
    this.name = 'ContextLengthError';
  }
}

export class AuthenticationError extends LLMError {
  constructor(providerId: string) {
    super('Invalid or missing API key', 'AUTHENTICATION', providerId, 401, false);
    this.name = 'AuthenticationError';
  }
}
