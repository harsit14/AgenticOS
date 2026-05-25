// @ts-nocheck — legacy code carried over from Phase 1/2/3; type-clean port pending. See tsconfig comment.
import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ChatParams, ChatResponse, ToolCall, UsageInfo } from '@agentic-os/types';
import type { StreamEvent } from './types.js';
import { BaseProvider, getModelPricing } from './base.js';

function parseToolArguments(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function buildAnthropicMessages(messages: ChatMessage[]) {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const content: unknown[] = [];
        if (m.content) {
          content.push({ type: 'text', text: m.content });
        }
        for (const call of m.toolCalls) {
          content.push({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: parseToolArguments(call.arguments),
          });
        }
        return { role: 'assistant', content };
      }

      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId ?? '',
              content: m.content,
            },
          ],
        };
      }

      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      };
    });
}

export class AnthropicProvider extends BaseProvider {
  readonly providerId = 'anthropic';
  readonly providerName = 'Anthropic';
  readonly baseUrl = 'https://api.anthropic.com';

  private client: Anthropic;

  constructor(config: import('./types.js').ProviderConfig = {}) {
    super(config);
    this.client = new Anthropic({
      apiKey: this.apiKey,
      timeout: this.timeout,
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const systemPrompt = params.systemPrompt || '';

      const response = await this.withRetry(async () => {
        return this.client.messages.create({
          model: params.model || 'claude-3-5-sonnet-20241022',
          max_tokens: params.maxTokens || 4096,
          temperature: params.temperature ?? 0.7,
          system: systemPrompt,
          messages: buildAnthropicMessages(params.messages),
          ...(params.tools && params.tools.length > 0
            ? {
                tools: params.tools.map(t => ({
                  name: t.id,
                  description: t.description,
                  input_schema: t.parameters as Record<string, unknown>,
                })),
              }
            : {}),
        });
      });

      const latencyMs = Date.now() - startTime;
      const usage = response.usage;
      const inputTokens = usage.input_tokens;
      const outputTokens = usage.output_tokens;
      const totalTokens = inputTokens + outputTokens;

      const pricing = getModelPricing(params.model || 'claude-3-5-sonnet');
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, outputTokens);

      // Extract content from response
      let content = '';
      let finishReason = 'stop';
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          finishReason = 'tool_use';
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          });
        }
      }

      return {
        content,
        finishReason: finishReason as 'stop' | 'length' | 'tool_use' | 'error',
        usage: { inputTokens, outputTokens, totalTokens },
        latencyMs,
        costUsd,
        raw: response,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
    } catch (error) {
      throw this.parseError(error, this.providerId);
    }
  }

  async *streamChat(params: ChatParams): AsyncGenerator<StreamEvent> {
    const startTime = Date.now();
    let totalOutputTokens = 0;

    try {
      const systemPrompt = params.systemPrompt || '';

      const stream = await this.client.messages.stream({
        model: params.model || 'claude-3-5-sonnet-20241022',
        max_tokens: params.maxTokens || 4096,
        temperature: params.temperature ?? 0.7,
        system: systemPrompt,
        messages: params.messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            totalOutputTokens++;
            yield { type: 'content', content: event.delta.text };
          }
        } else if (event.type === 'message_delta') {
          if (event.usage) {
            totalOutputTokens = event.usage.output_tokens;
          }
        }
      }

      const latencyMs = Date.now() - startTime;
      const inputTokens = BaseProvider.countMessageTokens(params.messages);
      const pricing = getModelPricing(params.model || 'claude-3-5-sonnet');
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, totalOutputTokens);

      yield {
        type: 'done',
        usage: {
          inputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: inputTokens + totalOutputTokens,
        },
        finishReason: 'stop',
      };
    } catch (error) {
      yield { type: 'error', error: (error as Error).message };
    }
  }

  async embed(
    texts: string[]
  ): Promise<{ embeddings: number[][]; usage: UsageInfo; model: string }> {
    // Anthropic doesn't have an embedding model, use a placeholder
    return {
      embeddings: texts.map(() => []),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'none',
    };
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.messages.list({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
