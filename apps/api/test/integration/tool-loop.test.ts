/**
 * P1 — executor tool-loop integration test.
 *
 * Uses a temp SQLite DB and a fake LLM provider that returns a tool call on
 * the first turn and a final answer on the second. The real ToolRegistry runs
 * the `calculator` tool (which exercises the safe-math evaluator), so this
 * covers the full loop: tool_use → ToolRegistry.execute → tool message → final.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ChatParams, ChatResponse, StreamEvent } from '@agentic-os/types';

const tmpDir = mkdtempSync(join(tmpdir(), 'agentic-toolloop-'));
process.env.DATABASE_URL = `file:${join(tmpDir, 'test.db')}`;

// Fake LLM — each test queues the responses chat() should return in order,
// and the events streamChat() should yield.
const fakeChat = vi.fn<[ChatParams], Promise<ChatResponse>>();
let streamEvents: StreamEvent[] = [];

vi.mock('../../src/core/providers/index.js', () => ({
  getProviderManager: () => ({
    configure: vi.fn(),
    getProvider: () => ({
      chat: fakeChat,
      streamChat: async function* () {
        for (const ev of streamEvents) yield ev;
      },
    }),
    clearCache: vi.fn(),
  }),
}));

const { db, initDb } = await import('../../src/db/index.js');
const { executeMessage, executeMessageStream } = await import(
  '../../src/core/agents/executor.js'
);
const schema = await import('../../src/db/schema.js');
const { providers, models, agents, sessions, messages, usageRecords, settings } = schema;
const { eq } = await import('drizzle-orm');

const PROVIDER_ID = 'lmstudio';
const MODEL_ID = 'lmstudio:test-model';
const AGENT_ID = 'agent-toolloop';
const SESSION_ID = 'session-toolloop';

const CALCULATOR_TOOL = {
  id: 'calculator',
  name: 'Calculator',
  description: 'Perform mathematical calculations',
  parameters: {
    type: 'object',
    properties: { expression: { type: 'string', description: 'Expression' } },
    required: ['expression'],
  },
  requiresApproval: false,
};

function chatResponse(partial: Partial<ChatResponse>): ChatResponse {
  return {
    content: '',
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    latencyMs: 1,
    costUsd: 0,
    raw: {},
    ...partial,
  };
}

async function reseed(opts: {
  supportsFunctionCalling: boolean;
  tools: unknown[];
  contextWindow?: number;
}) {
  const now = new Date();
  await db.delete(messages).run();
  await db.delete(usageRecords).run();
  await db.delete(sessions).run();
  await db.delete(agents).run();
  await db.delete(models).run();
  await db.delete(providers).run();
  await db.delete(settings).run();

  await db
    .insert(providers)
    .values({
      id: PROVIDER_ID,
      name: PROVIDER_ID,
      displayName: 'LM Studio',
      baseUrl: 'http://localhost:1234',
      apiKeyEnvVar: '',
      isLocal: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .run();

  await db
    .insert(models)
    .values({
      id: MODEL_ID,
      providerId: PROVIDER_ID,
      name: 'test-model',
      displayName: 'Test Model',
      contextWindow: opts.contextWindow ?? 8192,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      supportsStreaming: true,
      supportsVision: false,
      supportsFunctionCalling: opts.supportsFunctionCalling,
      status: 'active',
      metadata: {},
      createdAt: now,
      updatedAt: now,
    })
    .run();

  await db
    .insert(agents)
    .values({
      id: AGENT_ID,
      name: 'Tool agent',
      description: 'tool loop fixture',
      persona: {
        tone: 'professional',
        systemPrompt: 'You are a calculator assistant.',
        temperature: 0.2,
        maxTokens: 512,
        knowledgeBases: [],
      },
      tools: opts.tools as never,
      defaultModelId: MODEL_ID,
      memoryConfig: { strategy: 'sliding_window', maxMessages: 20 },
      rateLimit: 60,
      createdBy: 'local',
      isTemplate: false,
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
    .run();

  await db
    .insert(sessions)
    .values({
      id: SESSION_ID,
      agentId: AGENT_ID,
      modelId: MODEL_ID,
      status: 'active',
      startedAt: now,
      metadata: {},
    })
    .run();
}

beforeAll(async () => {
  await initDb();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  fakeChat.mockReset();
  streamEvents = [];
});

describe('executeMessage — tool loop', () => {
  it('runs a tool call then produces a final answer', async () => {
    await reseed({ supportsFunctionCalling: true, tools: [CALCULATOR_TOOL] });

    // Turn 1: model asks for the calculator. Turn 2: model answers.
    fakeChat
      .mockResolvedValueOnce(
        chatResponse({
          content: '',
          finishReason: 'tool_use',
          toolCalls: [
            {
              id: 'call_1',
              name: 'calculator',
              arguments: JSON.stringify({ expression: '2 + 2' }),
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        chatResponse({ content: 'The answer is 4.', finishReason: 'stop' }),
      );

    const result = await executeMessage({
      sessionId: SESSION_ID,
      userMessage: 'What is 2 + 2?',
    });

    // Two LLM calls: the tool request and the final answer.
    expect(fakeChat).toHaveBeenCalledTimes(2);
    expect(result.toolSteps).toBe(1);
    expect(result.assistantMessage.content).toBe('The answer is 4.');

    // The second call must have received the tool result in its messages.
    const secondCallMessages = fakeChat.mock.calls[1][0].messages;
    const toolMsg = secondCallMessages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toContain('4');
    expect(toolMsg?.toolCallId).toBe('call_1');

    // Persisted transcript: user, assistant(tool-call), tool, assistant(final).
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, SESSION_ID))
      .orderBy(messages.createdAt)
      .all();
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(rows[2].content).toContain('4');
    expect(rows[3].content).toBe('The answer is 4.');

    // Usage aggregates both LLM calls.
    const usage = await db.select().from(usageRecords).all();
    expect(usage).toHaveLength(1);
    expect(usage[0].requestCount).toBe(1);
    expect(usage[0].inputTokens).toBe(20); // 10 + 10
    expect(usage[0].outputTokens).toBe(10); // 5 + 5
  });

  it('does not offer tools when the model lacks function calling', async () => {
    await reseed({ supportsFunctionCalling: false, tools: [CALCULATOR_TOOL] });

    fakeChat.mockResolvedValueOnce(
      chatResponse({ content: 'Plain answer.', finishReason: 'stop' }),
    );

    const result = await executeMessage({
      sessionId: SESSION_ID,
      userMessage: 'hello',
    });

    expect(fakeChat).toHaveBeenCalledTimes(1);
    expect(fakeChat.mock.calls[0][0].tools).toBeUndefined();
    expect(result.toolSteps).toBe(0);
    expect(result.assistantMessage.content).toBe('Plain answer.');
  });

  it('reports a tool error back to the model when the tool is not on the agent', async () => {
    // Agent has NO tools, but model supports function calling and the LLM
    // (incorrectly) emits a tool call — the executor must reject it safely.
    await reseed({ supportsFunctionCalling: true, tools: [CALCULATOR_TOOL] });

    fakeChat
      .mockResolvedValueOnce(
        chatResponse({
          finishReason: 'tool_use',
          toolCalls: [
            { id: 'call_x', name: 'web_search', arguments: '{"query":"hi"}' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        chatResponse({ content: 'Could not use that tool.', finishReason: 'stop' }),
      );

    const result = await executeMessage({
      sessionId: SESSION_ID,
      userMessage: 'search something',
    });

    expect(result.assistantMessage.content).toBe('Could not use that tool.');
    const toolMsg = fakeChat.mock.calls[1][0].messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toMatch(/not available/i);
  });
});

describe('executeMessage — context trimming', () => {
  it('rejects a prompt that cannot fit the model context window', async () => {
    // Tiny window: even the user message alone won't fit once output tokens
    // and the safety margin are reserved.
    await reseed({ supportsFunctionCalling: false, tools: [], contextWindow: 100 });

    await expect(
      executeMessage({
        sessionId: SESSION_ID,
        userMessage: 'word '.repeat(2000),
      }),
    ).rejects.toThrow(/too long/i);

    expect(fakeChat).not.toHaveBeenCalled();
  });
});

describe('executeMessageStream', () => {
  it('streams deltas and persists the final assistant message', async () => {
    await reseed({ supportsFunctionCalling: false, tools: [] });
    streamEvents = [
      { type: 'content', content: 'Hel' },
      { type: 'content', content: 'lo!' },
      {
        type: 'done',
        usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 },
        finishReason: 'stop',
      },
    ];

    const deltas: string[] = [];
    let done: { messageId: string } | null = null;
    for await (const ev of executeMessageStream({
      sessionId: SESSION_ID,
      userMessage: 'hi',
    })) {
      if (ev.type === 'delta') deltas.push(ev.content);
      else if (ev.type === 'done') done = ev;
    }

    expect(deltas.join('')).toBe('Hello!');
    expect(done).not.toBeNull();

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, SESSION_ID))
      .orderBy(messages.createdAt)
      .all();
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(rows[1].content).toBe('Hello!');

    // Usage is recorded for the streamed turn too.
    const usage = await db.select().from(usageRecords).all();
    expect(usage).toHaveLength(1);
    expect(usage[0].outputTokens).toBe(2);
  });

  it('emits an error event when the stream fails', async () => {
    await reseed({ supportsFunctionCalling: false, tools: [] });
    streamEvents = [{ type: 'error', error: 'model crashed' }];

    const events: string[] = [];
    for await (const ev of executeMessageStream({
      sessionId: SESSION_ID,
      userMessage: 'hi',
    })) {
      events.push(ev.type);
    }
    expect(events).toContain('error');

    // The user message is persisted; no assistant message on a failed stream.
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, SESSION_ID))
      .all();
    expect(rows.map((r) => r.role)).toEqual(['user']);
  });
});
