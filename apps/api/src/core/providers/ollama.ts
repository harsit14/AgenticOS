import type { ChatParams, ChatResponse, UsageInfo } from '@agentic-os/types';
import type { StreamEvent } from './types.js';
import { BaseProvider } from './base.js';

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends BaseProvider {
  readonly providerId = 'ollama';
  readonly providerName = 'Ollama';
  readonly baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const messages: OllamaMessage[] = params.messages.map(m => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.content,
      }));

      if (params.systemPrompt) {
        messages.unshift({ role: 'system', content: params.systemPrompt });
      }

      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: params.model || 'llama3',
            messages,
            stream: false,
            options: {
              temperature: params.temperature ?? 0.7,
              num_predict: params.maxTokens,
            },
          }),
        });

        if (!res.ok) {
          throw new Error(`Ollama error: ${res.status}`);
        }

        return res.json() as Promise<OllamaResponse>;
      });

      const latencyMs = Date.now() - startTime;
      const inputTokens = response.prompt_eval_count || BaseProvider.countMessageTokens(params.messages);
      const outputTokens = response.eval_count || BaseProvider.countTokens(response.response);
      const totalTokens = inputTokens + outputTokens;

      // Ollama is free, cost is 0
      const costUsd = 0;

      return {
        content: response.response,
        finishReason: response.done ? 'stop' : 'length',
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
      const messages: OllamaMessage[] = params.messages.map(m => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.content,
      }));

      if (params.systemPrompt) {
        messages.unshift({ role: 'system', content: params.systemPrompt });
      }

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model || 'llama3',
          messages,
          stream: true,
          options: {
            temperature: params.temperature ?? 0.7,
            num_predict: params.maxTokens,
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line) as OllamaResponse;
            if (data.response) {
              totalOutputTokens++;
              yield { type: 'content', content: data.response };
            }
            if (data.done) {
              const latencyMs = Date.now() - startTime;
              const inputTokens = data.prompt_eval_count || 0;
              yield {
                type: 'done',
                usage: {
                  inputTokens,
                  outputTokens: data.eval_count || totalOutputTokens,
                  totalTokens: inputTokens + (data.eval_count || totalOutputTokens),
                },
                finishReason: 'stop',
              };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (error) {
      yield { type: 'error', error: (error as Error).message };
    }
  }

  async embed(texts: string[]): Promise<{ embeddings: number[][]; usage: UsageInfo; model: string }> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: text,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { embedding: number[] };
        embeddings.push(data.embedding);
      } else {
        embeddings.push([]);
      }
    }

    return {
      embeddings,
      usage: { inputTokens: texts.length, outputTokens: 0, totalTokens: texts.length },
      model: 'nomic-embed-text',
    };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // List available models in Ollama
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json() as { models: Array<{ name: string }> };
        return data.models.map(m => m.name);
      }
      return [];
    } catch {
      return [];
    }
  }
}

// LM Studio uses similar API to Ollama
export class LMStudioProvider extends OllamaProvider {
  readonly providerId = 'lmstudio';
  readonly providerName = 'LM Studio';
  readonly baseUrl = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';
}