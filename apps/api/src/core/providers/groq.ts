import type { ChatParams, ChatResponse, UsageInfo } from '@agentic-os/types';
import type { StreamEvent } from './types.js';
import { BaseProvider, getModelPricing } from './base.js';

export class GroqProvider extends BaseProvider {
  readonly providerId = 'groq';
  readonly providerName = 'Groq';
  readonly baseUrl = 'https://api.groq.com/openai/v1';

  private apiKey: string;

  constructor() {
    super({});
    this.apiKey = process.env.GROQ_API_KEY || '';
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: params.model || 'llama-3.1-8b-instant',
            messages: [
              ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
              ...params.messages.map(m => ({ role: m.role, content: m.content })),
            ],
            temperature: params.temperature ?? 0.7,
            max_tokens: params.maxTokens,
          }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(error.error?.message || `Groq error: ${res.status}`);
        }

        return res.json();
      });

      const latencyMs = Date.now() - startTime;
      const usage = response.usage;
      const inputTokens = usage.prompt_tokens;
      const outputTokens = usage.completion_tokens;
      const totalTokens = usage.total_tokens;

      const pricing = getModelPricing(params.model || 'llama-3.1-8b-instant');
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, outputTokens);

      return {
        content: response.choices[0].message.content || '',
        finishReason: 'stop',
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model || 'llama-3.1-8b-instant',
          messages: [
            ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
            ...params.messages.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Groq error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for await (const chunk of reader) {
        const lines = decoder.decode(chunk, { stream: true }).split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          if (line === 'data: [DONE]') break;

          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0]?.delta?.content;
            if (content) {
              totalOutputTokens++;
              yield { type: 'content', content };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      const inputTokens = BaseProvider.countMessageTokens(params.messages);
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
    // Groq doesn't provide embeddings, use a placeholder
    return {
      embeddings: texts.map(() => []),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'none',
    };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export class PerplexityProvider extends BaseProvider {
  readonly providerId = 'perplexity';
  readonly providerName = 'Perplexity';
  readonly baseUrl = 'https://api.perplexity.ai';

  private apiKey: string;

  constructor() {
    super({});
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: params.model || 'sonar',
            messages: [
              ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
              ...params.messages.map(m => ({ role: m.role, content: m.content })),
            ],
            temperature: params.temperature ?? 0.7,
            max_tokens: params.maxTokens,
          }),
        });

        if (!res.ok) {
          throw new Error(`Perplexity error: ${res.status}`);
        }

        return res.json();
      });

      const latencyMs = Date.now() - startTime;
      const usage = response.usage;
      const inputTokens = usage.prompt_tokens;
      const outputTokens = usage.completion_tokens;
      const totalTokens = usage.total_tokens;

      const pricing = getModelPricing(params.model || 'sonar');
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, outputTokens);

      return {
        content: response.choices[0].message.content || '',
        finishReason: 'stop',
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
    let totalOutputTokens = 0;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model || 'sonar',
          messages: params.messages.map(m => ({ role: m.role, content: m.content })),
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Perplexity error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for await (const chunk of reader) {
        const lines = decoder.decode(chunk, { stream: true }).split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          if (line === 'data: [DONE]') break;

          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0]?.delta?.content;
            if (content) {
              totalOutputTokens++;
              yield { type: 'content', content };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      const inputTokens = BaseProvider.countMessageTokens(params.messages);
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
    return {
      embeddings: texts.map(() => []),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'none',
    };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export class MistralProvider extends BaseProvider {
  readonly providerId = 'mistral';
  readonly providerName = 'Mistral AI';
  readonly baseUrl = 'https://api.mistral.ai/v1';

  private apiKey: string;

  constructor() {
    super({});
    this.apiKey = process.env.MISTRAL_API_KEY || '';
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: params.model || 'mistral-large-latest',
            messages: [
              ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
              ...params.messages.map(m => ({ role: m.role, content: m.content })),
            ],
            temperature: params.temperature ?? 0.7,
            max_tokens: params.maxTokens,
          }),
        });

        if (!res.ok) {
          throw new Error(`Mistral error: ${res.status}`);
        }

        return res.json();
      });

      const latencyMs = Date.now() - startTime;
      const usage = response.usage;
      const inputTokens = usage.prompt_tokens;
      const outputTokens = usage.completion_tokens;
      const totalTokens = usage.total_tokens;

      const pricing = getModelPricing(params.model || 'mistral-large-latest');
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, outputTokens);

      return {
        content: response.choices[0].message.content || '',
        finishReason: 'stop',
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
    let totalOutputTokens = 0;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model || 'mistral-large-latest',
          messages: params.messages.map(m => ({ role: m.role, content: m.content })),
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Mistral error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for await (const chunk of reader) {
        const lines = decoder.decode(chunk, { stream: true }).split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          if (line === 'data: [DONE]') break;

          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0]?.delta?.content;
            if (content) {
              totalOutputTokens++;
              yield { type: 'content', content };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      const inputTokens = BaseProvider.countMessageTokens(params.messages);
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
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-embed',
        input: texts,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        embeddings: data.data.map((d: { embedding: number[] }) => d.embedding),
        usage: data.usage ? { inputTokens: data.usage.prompt_tokens, outputTokens: 0, totalTokens: data.usage.total_tokens } : { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'mistral-embed',
      };
    }

    return {
      embeddings: texts.map(() => []),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'none',
    };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}