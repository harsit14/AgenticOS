import OpenAI from 'openai';
import type { ChatParams, ChatResponse, UsageInfo } from '@agentic-os/types';
import type { StreamEvent } from './types.js';
import { BaseProvider, getModelPricing } from './base.js';

export class OpenAIProvider extends BaseProvider {
  readonly providerId = 'openai';
  readonly providerName = 'OpenAI';
  readonly baseUrl = 'https://api.openai.com/v1';

  private client: OpenAI;

  constructor() {
    super({});
    this.client = new OpenAI({
      apiKey: this.apiKey,
      timeout: this.timeout,
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        return this.client.chat.completions.create({
          model: params.model || 'gpt-4o',
          messages: [
            ...(params.systemPrompt ? [{ role: 'system' as const, content: params.systemPrompt }] : []),
            ...params.messages.map(m => ({
              role: m.role as 'user' | 'assistant' | 'system',
              content: m.content,
              name: m.name,
            })),
          ],
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens,
          ...(params.tools && params.tools.length > 0 ? {
            tools: params.tools.map(t => ({
              type: 'function' as const,
              function: {
                name: t.id,
                description: t.description,
                parameters: t.parameters,
              },
            })),
          } : {}),
        });
      });

      const latencyMs = Date.now() - startTime;
      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = usage?.total_tokens || inputTokens + outputTokens;

      const pricing = getModelPricing(params.model || 'gpt-4o');
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, outputTokens);

      const choice = response.choices[0];
      let finishReason = 'stop';
      if (choice.finish_reason === 'length') finishReason = 'length';
      else if (choice.finish_reason === 'tool_calls') finishReason = 'tool_use';

      return {
        content: choice.message.content || '',
        finishReason: finishReason as 'stop' | 'length' | 'tool_use' | 'error',
        usage: { inputTokens, outputTokens, totalTokens },
        latencyMs,
        costUsd,
        raw: response,
      };
    } catch (error) {
      throw this.parseError(error, this.providerId);
    }
  }

  async *streamChat(params: ChatParams): AsyncGenerator<StreamEvent> {
    const startTime = Date.now();
    let totalOutputTokens = 0;

    try {
      const stream = await this.client.chat.completions.create({
        model: params.model || 'gpt-4o',
        messages: [
          ...(params.systemPrompt ? [{ role: 'system' as const, content: params.systemPrompt }] : []),
          ...params.messages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
        ],
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          totalOutputTokens++;
          yield { type: 'content', content: delta };
        }
      }

      const latencyMs = Date.now() - startTime;
      const inputTokens = BaseProvider.countMessageTokens(params.messages);
      const pricing = getModelPricing(params.model || 'gpt-4o');
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, totalOutputTokens);

      yield {
        type: 'done',
        usage: { inputTokens, outputTokens: totalOutputTokens, totalTokens: inputTokens + totalOutputTokens },
        finishReason: 'stop',
      };
    } catch (error) {
      yield { type: 'error', error: (error as Error).message };
    }
  }

  async embed(texts: string[]): Promise<{ embeddings: number[][]; usage: UsageInfo; model: string }> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    return {
      embeddings: response.data.map(d => d.embedding),
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: 0,
        totalTokens: response.usage.total_tokens,
      },
      model: 'text-embedding-3-small',
    };
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

// Also support Azure OpenAI
export class AzureProvider extends BaseProvider {
  readonly providerId = 'azure';
  readonly providerName = 'Azure OpenAI';
  readonly baseUrl = process.env.AZURE_OPENAI_ENDPOINT || '';

  private client: OpenAI;

  constructor() {
    super({});
    const apiVersion = '2024-02-01';
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: `${this.baseUrl}/openai/deployments`,
      defaultQuery: { 'api-version': apiVersion },
    });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    // Azure uses deployment name as model
    const deployment = params.model || 'gpt-4o';
    return this.client.chat.completions.create({
      model: deployment,
      messages: params.messages as OpenAI.Chat.ChatCompletionMessageParam[],
    }).then(response => {
      const usage = response.usage!;
      return {
        content: response.choices[0].message.content || '',
        finishReason: 'stop' as const,
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        latencyMs: 0,
        costUsd: 0,
        raw: response,
      };
    });
  }

  async *streamChat(params: ChatParams): AsyncGenerator<StreamEvent> {
    const deployment = params.model || 'gpt-4o';
    const stream = await this.client.chat.completions.create({
      model: deployment,
      messages: params.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield { type: 'content', content };
      }
    }

    yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, finishReason: 'stop' };
  }

  async embed(texts: string[]): Promise<{ embeddings: number[][]; usage: UsageInfo; model: string }> {
    throw new Error('Azure embeddings not implemented');
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({ model: 'dummy', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 });
      return false; // Will error on actual call
    } catch (e) {
      return false;
    }
  }
}