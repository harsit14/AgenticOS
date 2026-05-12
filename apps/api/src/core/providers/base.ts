import type { ChatParams, ChatResponse, UsageInfo, StreamEvent } from '@agentic-os/types';
import type { LLMProvider, ProviderConfig, ModelPricing, RateLimiter } from './types.js';
import { LLMError, RateLimitError, ContextLengthError, AuthenticationError } from './types.js';

// Base class with common functionality
export abstract class BaseProvider implements LLMProvider {
  abstract readonly providerId: string;
  abstract readonly providerName: string;
  abstract readonly baseUrl: string;

  protected apiKey: string;
  protected timeout: number;
  protected maxRetries: number;
  protected rateLimiter?: RateLimiter;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey || process.env[`${this.providerId.toUpperCase()}_API_KEY`] || '';
    this.timeout = config.timeout || 60000;
    this.maxRetries = config.maxRetries || 3;
  }

  abstract chat(params: ChatParams): Promise<ChatResponse>;
  abstract streamChat(params: ChatParams): AsyncGenerator<StreamEvent>;
  abstract embed(texts: string[]): Promise<{ embeddings: number[][]; usage: UsageInfo; model: string }>;
  abstract ping(): Promise<boolean>;

  getInfo() {
    return {
      id: this.providerId,
      name: this.providerName,
      isLocal: this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1'),
      supportsStreaming: true,
      supportsVision: true,
      supportsFunctionCalling: true,
      maxContextWindow: 200000,
    };
  }

  // Common token counting (approximate for common models)
  static countTokens(text: string): number {
    // Rough approximation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  // Count tokens for a message array
  static countMessageTokens(messages: Array<{ role: string; content: string }>): number {
    let total = 0;
    for (const msg of messages) {
      // Base tokens per message
      total += 4;
      // Content tokens
      total += this.countTokens(msg.role);
      total += this.countTokens(msg.content);
    }
    // Extra for completion
    total += 3;
    return total;
  }

  // Calculate cost based on model pricing
  static calculateCost(pricing: ModelPricing, inputTokens: number, outputTokens: number): number {
    return (inputTokens * pricing.inputCostPer1M / 1_000_000) +
           (outputTokens * pricing.outputCostPer1M / 1_000_000);
  }

  // Retry helper with exponential backoff
  protected async withRetry<T>(
    fn: () => Promise<T>,
    retryableErrors: string[] = ['RATE_LIMIT', 'TIMEOUT', 'SERVER_ERROR']
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (error instanceof LLMError && !error.retryable) {
          throw error;
        }

        if (error instanceof LLMError && !retryableErrors.includes(error.code)) {
          throw error;
        }

        if (attempt < this.maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected parseError(error: unknown, providerId: string): LLMError {
    if (error instanceof LLMError) return error;

    const err = error as { status?: number; code?: string; message?: string };

    if (err.status === 401 || err.status === 403) {
      return new AuthenticationError(providerId);
    }

    if (err.status === 429) {
      return new RateLimitError(providerId);
    }

    if (err.status === 400 && err.message?.includes('maximum context')) {
      return new LLMError(err.message, 'CONTEXT_LENGTH', providerId, 400, false);
    }

    return new LLMError(
      err.message || 'Unknown error',
      err.code || 'UNKNOWN',
      providerId,
      err.status,
      true
    );
  }

  // Build headers common to all providers
  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      // Provider-specific header format
      if (this.providerId === 'anthropic') {
        headers['x-api-key'] = this.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else if (this.providerId === 'openai') {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      } else if (this.providerId === 'groq') {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      } else if (this.providerId === 'perplexity') {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      } else if (this.providerId === 'mistral') {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
    }

    return headers;
  }
}

// Token pricing lookup
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-3-5-sonnet': { providerId: 'anthropic', modelId: 'claude-3-5-sonnet', inputCostPer1M: 3, outputCostPer1M: 15 },
  'claude-3-5-haiku': { providerId: 'anthropic', modelId: 'claude-3-5-haiku', inputCostPer1M: 0.8, outputCostPer1M: 4 },
  'claude-3-opus': { providerId: 'anthropic', modelId: 'claude-3-opus', inputCostPer1M: 15, outputCostPer1M: 75 },
  'gpt-4o': { providerId: 'openai', modelId: 'gpt-4o', inputCostPer1M: 5, outputCostPer1M: 15 },
  'gpt-4o-mini': { providerId: 'openai', modelId: 'gpt-4o-mini', inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  'gpt-4-turbo': { providerId: 'openai', modelId: 'gpt-4-turbo', inputCostPer1M: 10, outputCostPer1M: 30 },
  'gemini-1.5-pro': { providerId: 'vertex', modelId: 'gemini-1.5-pro', inputCostPer1M: 1.25, outputCostPer1M: 5 },
  'gemini-1.5-flash': { providerId: 'vertex', modelId: 'gemini-1.5-flash', inputCostPer1M: 0.075, outputCostPer1M: 0.30 },
};

export function getModelPricing(modelId: string): ModelPricing {
  return MODEL_PRICING[modelId] || { providerId: 'unknown', modelId, inputCostPer1M: 0, outputCostPer1M: 0 };
}