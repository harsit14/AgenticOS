import type { ChatMessage, ChatParams } from '@agentic-os/types';
import type { StreamEvent } from '../providers/types.js';
import { getProviderManager, getProviderForModel } from '../providers/index.js';
import { getRateLimiter } from '../providers/rate-limiter.js';
import { withSpan, recordRequest, recordError, incrementActiveSessions, decrementActiveSessions } from '../../telemetry/index.js';
import { getUsageTracker } from '../telemetry/usage-tracker.js';

export interface AgentExecutorConfig {
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  useStreaming?: boolean;
  userId?: string;
  agentId?: string;
}

export interface ExecutionResult {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_use' | 'error';
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  costUsd: number;
  modelId: string;
  providerId: string;
}

export interface StreamHandler {
  onContent: (content: string) => void;
  onDone: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
  onError: (error: string) => void;
}

// Main executor for running agent conversations
export class AgentExecutor {
  private providerManager = getProviderManager();
  private rateLimiter = getRateLimiter();
  private usageTracker = getUsageTracker();

  async execute(
    messages: ChatMessage[],
    config: AgentExecutorConfig
  ): Promise<ExecutionResult> {
    const modelId = config.modelId || 'claude-3-5-sonnet';
    const provider = getProviderForModel(modelId);

    if (!provider) {
      throw new Error(`No provider available for model: ${modelId}`);
    }

    // Apply rate limiting
    await this.rateLimiter.waitForToken(provider.providerId);

    // Track active session
    if (config.agentId) {
      incrementActiveSessions(config.agentId);
    }

    const params: ChatParams = {
      model: modelId,
      messages,
      systemPrompt: config.systemPrompt,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };

    try {
      const result = await withSpan(`llm.call.${provider.providerId}`, async () => {
        const response = await provider.chat(params);
        return response;
      }, {
        'model.id': modelId,
        'provider.id': provider.providerId,
        'llm.input_tokens': 0, // Will be updated
        'llm.output_tokens': 0, // Will be updated
      });

      const executionResult: ExecutionResult = {
        content: result.content,
        finishReason: result.finishReason,
        usage: result.usage,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        modelId,
        providerId: provider.providerId,
      };

      // Record metrics
      recordRequest({
        provider: provider.providerId,
        model: modelId,
        status: 'success',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
      });

      // Record usage for billing and budget tracking
      if (config.userId && config.agentId) {
        await this.usageTracker.recordUsage({
          userId: config.userId,
          agentId: config.agentId,
          modelId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
        });
      }

      return executionResult;
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Record error
      recordError(provider.providerId, modelId, errorMessage.split(':')[0] || 'unknown');

      // Track session as error
      if (config.agentId) {
        decrementActiveSessions(config.agentId);
      }

      throw error;
    } finally {
      if (config.agentId) {
        decrementActiveSessions(config.agentId);
      }
    }
  }

  async *stream(
    messages: ChatMessage[],
    config: AgentExecutorConfig,
    handler: StreamHandler
  ): AsyncGenerator<void> {
    const modelId = config.modelId || 'claude-3-5-sonnet';
    const provider = getProviderForModel(modelId);

    if (!provider) {
      handler.onError(`No provider available for model: ${modelId}`);
      return;
    }

    // Apply rate limiting
    await this.rateLimiter.waitForToken(provider.providerId);

    // Track active session
    if (config.agentId) {
      incrementActiveSessions(config.agentId);
    }

    const params: ChatParams = {
      model: modelId,
      messages,
      systemPrompt: config.systemPrompt,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      streaming: true,
    };

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let totalLatencyMs = 0;

    try {
      const startTime = Date.now();

      for await (const event of provider.streamChat(params)) {
        switch (event.type) {
          case 'content':
            handler.onContent(event.content);
            totalOutputTokens++;
            break;
          case 'done':
            totalInputTokens = event.usage.inputTokens;
            totalOutputTokens = event.usage.outputTokens;
            totalLatencyMs = Date.now() - startTime;
            handler.onDone(event.usage);
            break;
          case 'error':
            handler.onError(event.error);
            recordError(provider.providerId, modelId, event.error);
            break;
        }
      }

      // Record metrics for streaming (approximate cost)
      const pricing = this.getPricingForModel(modelId);
      totalCost = (totalInputTokens * pricing.inputCostPer1M + totalOutputTokens * pricing.outputCostPer1M) / 1_000_000;

      recordRequest({
        provider: provider.providerId,
        model: modelId,
        status: 'success',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        latencyMs: totalLatencyMs,
        costUsd: totalCost,
      });

      // Record usage for streaming (batched after completion)
      if (config.userId && config.agentId && totalInputTokens + totalOutputTokens > 0) {
        await this.usageTracker.recordUsage({
          userId: config.userId,
          agentId: config.agentId,
          modelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          costUsd: totalCost,
          latencyMs: totalLatencyMs,
        });
      }
    } catch (error) {
      handler.onError((error as Error).message);
      recordError(provider.providerId, modelId, (error as Error).message);

      if (config.agentId) {
        decrementActiveSessions(config.agentId);
      }
    } finally {
      if (config.agentId) {
        decrementActiveSessions(config.agentId);
      }
    }
  }

  // Estimate cost before execution
  estimateCost(modelId: string, messageCount: number): number {
    const pricing = this.getPricingForModel(modelId);
    const estimatedInputTokens = messageCount * 20;
    return (estimatedInputTokens * pricing.inputCostPer1M) / 1_000_000;
  }

  private getPricingForModel(modelId: string): { inputCostPer1M: number; outputCostPer1M: number } {
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet': { input: 3, output: 15 },
      'claude-3-5-haiku': { input: 0.8, output: 4 },
      'gpt-4o': { input: 5, output: 15 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gemini-1.5-pro': { input: 1.25, output: 5 },
      'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    };

    return pricing[modelId] || { input: 0, output: 0 };
  }

  // Get context window usage
  getContextUsage(messages: ChatMessage[], systemPrompt: string): {
    usedTokens: number;
    maxTokens: number;
    percentage: number;
    withinLimit: boolean;
  } {
    const maxTokens = 200000;
    const systemTokens = Math.ceil(systemPrompt.length / 4);
    const messageTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

    const usedTokens = systemTokens + messageTokens + 4 + 4;
    const percentage = (usedTokens / maxTokens) * 100;

    return {
      usedTokens,
      maxTokens,
      percentage,
      withinLimit: usedTokens < maxTokens * 0.95,
    };
  }
}

// Singleton instance
let executor: AgentExecutor | null = null;

export function getAgentExecutor(): AgentExecutor {
  if (!executor) {
    executor = new AgentExecutor();
  }
  return executor;
}