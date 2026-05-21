/**
 * Contract tests for the local LLM providers. These mock `fetch` so they run
 * with no Ollama / LM Studio process — they pin the request shape we send and
 * the response shape we parse, which is exactly where the two bugs lived:
 *   - Ollama /api/chat returns assistant text in `message.content`
 *     (NOT `response` — that's the /api/generate field)
 *   - LM Studio is OpenAI-compatible: POST /v1/chat/completions,
 *     read `choices[0].message.content`
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OllamaProvider, LMStudioProvider } from '../../src/core/providers/ollama.js';
import type { ChatParams } from '@agentic-os/types';

const baseParams: ChatParams = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'Hello there' }],
  systemPrompt: 'You are helpful.',
  temperature: 0.5,
  maxTokens: 256,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OllamaProvider.chat', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('parses assistant text from message.content (not response)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        model: 'test-model',
        created_at: '2026-05-19T00:00:00Z',
        message: { role: 'assistant', content: 'Hi! How can I help?' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 12,
        eval_count: 7,
      }),
    );

    const provider = new OllamaProvider();
    const result = await provider.chat(baseParams);

    expect(result.content).toBe('Hi! How can I help?');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.inputTokens).toBe(12);
    expect(result.usage.outputTokens).toBe(7);
    expect(result.usage.totalTokens).toBe(19);
    expect(result.costUsd).toBe(0);
  });

  it('POSTs to /api/chat with the system prompt prepended', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: { role: 'assistant', content: 'ok' }, done: true }),
    );

    const provider = new OllamaProvider();
    await provider.chat(baseParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/chat$/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.stream).toBe(false);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello there' });
  });

  it('falls back to an empty string when message is missing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ done: true }));
    const provider = new OllamaProvider();
    const result = await provider.chat(baseParams);
    expect(result.content).toBe('');
  });

  it('throws a typed error on a non-OK response', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    // maxRetries: 1 keeps the test fast (no exponential backoff sleeps).
    const provider = new OllamaProvider({ maxRetries: 1 });
    await expect(provider.chat(baseParams)).rejects.toThrow(/Ollama error: 500/);
  });
});

describe('LMStudioProvider.chat', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('parses choices[0].message.content from the OpenAI-compatible response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: { role: 'assistant', content: 'Local model says hi' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }),
    );

    const provider = new LMStudioProvider();
    const result = await provider.chat(baseParams);

    expect(result.content).toBe('Local model says hi');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.inputTokens).toBe(20);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(25);
    expect(result.costUsd).toBe(0);
  });

  it('POSTs to the OpenAI-compatible /v1/chat/completions endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
    );

    const provider = new LMStudioProvider();
    await provider.chat(baseParams);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/chat\/completions$/);
    // It must NOT use Ollama's native endpoint.
    expect(String(url)).not.toMatch(/\/api\/chat/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.max_tokens).toBe(256);
    expect(body.stream).toBe(false);
  });

  it('throws a typed error on a non-OK response', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));
    const provider = new LMStudioProvider({ maxRetries: 1 });
    await expect(provider.chat(baseParams)).rejects.toThrow(/LM Studio error: 404/);
  });

  it('is not an instance of OllamaProvider (separate protocol)', () => {
    expect(new LMStudioProvider()).not.toBeInstanceOf(OllamaProvider);
  });
});
