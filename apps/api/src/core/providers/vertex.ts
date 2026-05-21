// @ts-nocheck — legacy code carried over from Phase 1/2/3; type-clean port pending. See tsconfig comment.
import type { ChatParams, ChatResponse, UsageInfo } from '@agentic-os/types';
import type { StreamEvent } from './types.js';
import { BaseProvider, getModelPricing } from './base.js';

export class VertexProvider extends BaseProvider {
  readonly providerId = 'vertex';
  readonly providerName = 'Google Vertex AI';
  readonly baseUrl = 'https://{location}-aiplatform.googleapis.com/v1';

  private apiKey: string;

  constructor() {
    super({});
    this.apiKey = process.env.VERTEX_AI_API_KEY || '';
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      // Vertex AI uses a different API format - Google AI style
      const model = params.model || 'gemini-1.5-pro';

      // For Gemini, we use the Google AI API format
      const response = await this.withRetry(async () => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: {
                role: 'user',
                parts: params.messages.map(m => ({ text: m.content })),
              },
              generationConfig: {
                temperature: params.temperature ?? 0.7,
                maxOutputTokens: params.maxTokens,
              },
            }),
          }
        );

        if (!res.ok) {
          throw new Error(`Vertex AI error: ${res.status}`);
        }

        return res.json();
      });

      const latencyMs = Date.now() - startTime;

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const usage = response.usageMetadata || {};
      const inputTokens = usage.promptTokenCount || BaseProvider.countMessageTokens(params.messages);
      const outputTokens = usage.candidatesTokenCount || BaseProvider.countTokens(text);
      const totalTokens = usage.totalTokenCount || inputTokens + outputTokens;

      const pricing = getModelPricing(model);
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, outputTokens);

      return {
        content: text,
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
    const model = params.model || 'gemini-1.5-pro';
    let totalOutputTokens = 0;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: {
              role: 'user',
              parts: params.messages.map(m => ({ text: m.content })),
            },
            generationConfig: {
              temperature: params.temperature ?? 0.7,
              maxOutputTokens: params.maxTokens,
            },
          }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error(`Vertex AI error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for await (const chunk of reader) {
        try {
          const lines = decoder.decode(chunk, { stream: true }).split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6));
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              totalOutputTokens++;
              yield { type: 'content', content };
            }
          }
        } catch {
          // Skip invalid chunks
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:batchEmbedContents?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map(text => ({
            model: 'models/embedding-001',
            content: { parts: [{ text }] },
          })),
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      return {
        embeddings: data.embeddings?.map((e: { values: number[] }) => e.values) || [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'embedding-001',
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
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

export class BedrockProvider extends BaseProvider {
  readonly providerId = 'bedrock';
  readonly providerName = 'AWS Bedrock';
  readonly baseUrl = `https://bedrock.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`;

  constructor() {
    super({});
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      // Bedrock requires AWS credentials and signing
      const AWS = await import('@aws-sdk/client-bedrock-runtime');
      const client = new AWS.BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

      const model = params.model || 'anthropic.claude-3-sonnet-20240229-v1:0';
      const modelId = model.includes('.') ? model : `anthropic.${model}`;

      // Format for Claude on Bedrock
      const body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: params.maxTokens || 4096,
        temperature: params.temperature ?? 0.7,
        system: params.systemPrompt,
        messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      };

      const command = new AWS.InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const latencyMs = Date.now() - startTime;
      const content = responseBody.content?.[0]?.text || '';

      const usage = responseBody.usage || {};
      const inputTokens = usage.input_tokens || BaseProvider.countMessageTokens(params.messages);
      const outputTokens = usage.output_tokens || BaseProvider.countTokens(content);
      const totalTokens = inputTokens + outputTokens;

      const pricing = getModelPricing(model);
      const costUsd = BaseProvider.calculateCost(pricing, inputTokens, outputTokens);

      return {
        content,
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
    try {
      const AWS = await import('@aws-sdk/client-bedrock-runtime');
      const client = new AWS.BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

      const model = params.model || 'anthropic.claude-3-sonnet-20240229-v1:0';
      const modelId = model.includes('.') ? model : `anthropic.${model}`;

      const body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: params.maxTokens || 4096,
        temperature: params.temperature ?? 0.7,
        system: params.systemPrompt,
        messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      };

      const command = new AWS.InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      const content = responseBody.content?.[0]?.text || '';
      for (const char of content) {
        yield { type: 'content', content: char };
        await new Promise(r => setTimeout(r, 5));
      }

      const usage = responseBody.usage || {};
      yield {
        type: 'done',
        usage: {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || content.length,
          totalTokens: usage.total_tokens || content.length,
        },
        finishReason: 'stop',
      };
    } catch (error) {
      yield { type: 'error', error: (error as Error).message };
    }
  }

  async embed(texts: string[]): Promise<{ embeddings: number[][]; usage: UsageInfo; model: string }> {
    // Bedrock embedding models vary by model
    return {
      embeddings: texts.map(() => []),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'none',
    };
  }

  async ping(): Promise<boolean> {
    try {
      return !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
    } catch {
      return false;
    }
  }
}