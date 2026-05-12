import type { ChatMessage, ChatParams, ChatResponse, StreamEvent, UsageInfo } from '@agentic-os/types';

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

  // Chat completion
  chat(params: ChatParams): Promise<ChatResponse>;

  // Streaming chat
  streamChat(params: ChatParams): AsyncGenerator<StreamEvent>;

  // Embeddings (for RAG)
  embed(texts: string[]): Promise<EmbeddingResponse>;

  // Health check
  ping(): Promise<boolean>;

  // Get provider info
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

// Tool/function calling types
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: string; // JSON string
}

export interface ToolResult {
  name: string;
  content: string;
  isError?: boolean;
}

// Stream event types
export interface ContentDelta {
  type: 'content';
  content: string;
}

export interface DoneEvent {
  type: 'done';
  usage: UsageInfo;
  finishReason: string;
}

export interface ErrorEvent {
  type: 'error';
  error: string;
}

export type StreamEventType = ContentDelta | DoneEvent | ErrorEvent;

// Error types
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
    super(`Context length exceeded: ${usedTokens} > ${maxTokens}`, 'CONTEXT_LENGTH', providerId, 400, false);
    this.name = 'ContextLengthError';
  }
}

export class AuthenticationError extends LLMError {
  constructor(providerId: string) {
    super('Invalid or missing API key', 'AUTHENTICATION', providerId, 401, false);
    this.name = 'AuthenticationError';
  }
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