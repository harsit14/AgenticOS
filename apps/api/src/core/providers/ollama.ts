import type {
  ChatParams,
  ChatResponse,
  UsageInfo,
  StreamEvent,
  ToolCall,
  ToolDefinition,
} from '@agentic-os/types';
import type { ProviderConfig } from './types.js';
import { BaseProvider } from './base.js';

// ---------------------------------------------------------------------------
// Ollama — native /api/chat protocol
// ---------------------------------------------------------------------------

interface OllamaChatMessage {
  role: string;
  content: string;
}

// Shape of a non-streaming POST /api/chat response. Note: the assistant text
// lives in `message.content`. The top-level `response` field only exists on
// the /api/generate endpoint, which we do not use.
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message?: OllamaChatMessage;
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends BaseProvider {
  readonly providerId: string = 'ollama';
  readonly providerName: string = 'Ollama';
  readonly baseUrl: string = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  constructor(config: ProviderConfig = {}) {
    // The first request to a model triggers a JIT load that can take 30-60s
    // for a large model; the connection often fails until the load finishes.
    // withRetry uses exponential backoff (1,2,4,8,16s…), so 6 attempts span
    // ~30s of waiting — enough for most cold loads. An explicit config value
    // still wins.
    super({ maxRetries: 6, ...config });
  }

  private buildMessages(params: ChatParams): OllamaChatMessage[] {
    const messages: OllamaChatMessage[] = params.messages.map((m) => ({
      role: m.role === 'tool' ? 'assistant' : m.role,
      content: m.content,
    }));
    if (params.systemPrompt) {
      messages.unshift({ role: 'system', content: params.systemPrompt });
    }
    return messages;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: params.model || 'llama3',
            messages: this.buildMessages(params),
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

        return (await res.json()) as OllamaChatResponse;
      });

      const latencyMs = Date.now() - startTime;
      // /api/chat puts the assistant text in message.content.
      const content = response.message?.content ?? '';
      const inputTokens =
        response.prompt_eval_count ?? BaseProvider.countMessageTokens(params.messages);
      const outputTokens = response.eval_count ?? BaseProvider.countTokens(content);

      return {
        content,
        finishReason: this.mapFinishReason(response),
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        latencyMs,
        costUsd: 0, // local — no per-token cost
        raw: response,
      };
    } catch (error) {
      throw this.parseError(error, this.providerId);
    }
  }

  private mapFinishReason(r: OllamaChatResponse): ChatResponse['finishReason'] {
    if (r.done_reason === 'length') return 'length';
    return r.done ? 'stop' : 'length';
  }

  async *streamChat(params: ChatParams): AsyncGenerator<StreamEvent> {
    const startTime = Date.now();
    let totalOutputTokens = 0;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model || 'llama3',
          messages: this.buildMessages(params),
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

          let data: OllamaChatResponse;
          try {
            data = JSON.parse(line) as OllamaChatResponse;
          } catch {
            continue; // skip malformed NDJSON line
          }

          // Each streaming chunk carries an incremental message.content.
          const delta = data.message?.content;
          if (delta) {
            totalOutputTokens++;
            yield { type: 'content', content: delta };
          }

          if (data.done) {
            const inputTokens = data.prompt_eval_count ?? 0;
            const outputTokens = data.eval_count ?? totalOutputTokens;
            yield {
              type: 'done',
              usage: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
              },
              finishReason: 'stop',
            };
          }
        }
      }
    } catch (error) {
      yield { type: 'error', error: (error as Error).message };
    }
    // startTime kept for parity with other providers' latency reporting.
    void startTime;
  }

  async embed(
    texts: string[],
  ): Promise<{ embeddings: number[][]; usage: UsageInfo; model: string }> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
      });

      if (res.ok) {
        const data = (await res.json()) as { embedding: number[] };
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

  // List models currently available in Ollama.
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      return (data.models ?? []).map((m) => m.name);
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// LM Studio — OpenAI-compatible /v1/chat/completions protocol
//
// LM Studio does NOT speak Ollama's /api/chat. It serves an OpenAI-compatible
// API, so this is a standalone provider (it must not extend OllamaProvider).
// ---------------------------------------------------------------------------

interface OpenAIToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

interface OpenAICompatChoice {
  message?: {
    role: string;
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  delta?: { content?: string };
  finish_reason?: string | null;
}

interface OpenAICompatResponse {
  choices?: OpenAICompatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// An OpenAI-format message as sent on the wire (raw JSON).
interface OpenAIWireMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

// Map our canonical tool definitions to the OpenAI `tools` request field.
function toOpenAITools(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      // Use the registry id as the function name so the executor can look the
      // tool up directly when the model calls it back.
      name: t.id,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export class LMStudioProvider extends BaseProvider {
  readonly providerId: string = 'lmstudio';
  readonly providerName: string = 'LM Studio';
  readonly baseUrl: string = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';

  constructor(config: ProviderConfig = {}) {
    // See OllamaProvider — first request to a cold model triggers a slow JIT
    // load; extra retries give it time to finish.
    super({ maxRetries: 6, ...config });
  }

  // Build the OpenAI-format message array, threading tool calls + tool results
  // so a multi-step tool loop stays spec-compliant.
  private buildOpenAIMessages(params: ChatParams): OpenAIWireMessage[] {
    const messages: OpenAIWireMessage[] = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    for (const m of params.messages) {
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
      } else if (m.role === 'tool') {
        messages.push({
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolCallId,
        });
      } else {
        messages.push({ role: m.role, content: m.content, name: m.name });
      }
    }
    return messages;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();
    const hasTools = !!params.tools && params.tools.length > 0;

    try {
      const response = await this.withRetry(async () => {
        const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: params.model || 'local-model',
            messages: this.buildOpenAIMessages(params),
            temperature: params.temperature ?? 0.7,
            max_tokens: params.maxTokens,
            stream: false,
            ...(hasTools ? { tools: toOpenAITools(params.tools!) } : {}),
          }),
        });

        if (!res.ok) {
          throw new Error(`LM Studio error: ${res.status}`);
        }

        return (await res.json()) as OpenAICompatResponse;
      });

      const latencyMs = Date.now() - startTime;
      const choice = response.choices?.[0];
      const content = choice?.message?.content ?? '';
      const inputTokens =
        response.usage?.prompt_tokens ?? BaseProvider.countMessageTokens(params.messages);
      const outputTokens =
        response.usage?.completion_tokens ?? BaseProvider.countTokens(content);

      const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

      const finishReason: ChatResponse['finishReason'] =
        toolCalls.length > 0 || choice?.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice?.finish_reason === 'length'
            ? 'length'
            : 'stop';

      return {
        content,
        finishReason,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
        },
        latencyMs,
        costUsd: 0, // local — no per-token cost
        raw: response,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
    } catch (error) {
      throw this.parseError(error, this.providerId);
    }
  }

  async *streamChat(params: ChatParams): AsyncGenerator<StreamEvent> {
    let totalOutputTokens = 0;

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model || 'local-model',
          messages: this.buildOpenAIMessages(params),
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`LM Studio error: ${response.status}`);
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
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            const inputTokens = BaseProvider.countMessageTokens(params.messages);
            yield {
              type: 'done',
              usage: {
                inputTokens,
                outputTokens: totalOutputTokens,
                totalTokens: inputTokens + totalOutputTokens,
              },
              finishReason: 'stop',
            };
            continue;
          }

          let data: OpenAICompatResponse;
          try {
            data = JSON.parse(payload) as OpenAICompatResponse;
          } catch {
            continue;
          }

          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            totalOutputTokens++;
            yield { type: 'content', content: delta };
          }
        }
      }
    } catch (error) {
      yield { type: 'error', error: (error as Error).message };
    }
  }

  async embed(
    texts: string[],
  ): Promise<{ embeddings: number[][]; usage: UsageInfo; model: string }> {
    const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'local-embedding', input: texts }),
    });

    if (!res.ok) {
      throw new Error(`LM Studio embeddings error: ${res.status}`);
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };

    return {
      embeddings: (data.data ?? []).map((d) => d.embedding),
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? texts.length,
        outputTokens: 0,
        totalTokens: data.usage?.total_tokens ?? texts.length,
      },
      model: 'local-embedding',
    };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // List models currently loaded in LM Studio.
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return (data.data ?? []).map((m) => m.id);
    } catch {
      return [];
    }
  }
}
