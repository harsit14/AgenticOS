/**
 * Phase 2.6 — end-to-end message loop integration test.
 *
 * Sets DATABASE_URL to a temp SQLite file so the production `db` symbol
 * uses an isolated database. Mocks the Anthropic SDK so no network call
 * is made.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// 1. Point DATABASE_URL at a temp file BEFORE any production module is loaded.
const tmpDir = mkdtempSync(join(tmpdir(), 'agentic-test-'));
process.env.DATABASE_URL = `file:${join(tmpDir, 'test.db')}`;

// 2. Mock the Anthropic SDK before any code path touches it.
const messagesCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreate, list: vi.fn() };
  },
}));

// 3. Import the production modules — they will open the temp DB.
const { db, initDb } = await import('../../src/db/index.js');
const { executeMessage } = await import('../../src/core/agents/executor.js');
const { setSetting } = await import('../../src/core/settings/index.js');
const schema = await import('../../src/db/schema.js');
const { providers, models, agents, sessions, messages, usageRecords, settings } = schema;
const { eq } = await import('drizzle-orm');

const SEED_PROVIDER_ID = 'anthropic';
const SEED_MODEL_ID = 'claude-3-5-sonnet-test';
const SEED_AGENT_ID = 'agent-test';
const SEED_SESSION_ID = 'session-test';

async function reseed() {
  const now = new Date();

  await db.delete(messages).run();
  await db.delete(usageRecords).run();
  await db.delete(sessions).run();
  await db.delete(agents).run();
  await db.delete(models).run();
  await db.delete(providers).run();
  await db.delete(settings).run();

  await db.insert(providers).values({
    id: SEED_PROVIDER_ID,
    name: SEED_PROVIDER_ID,
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    isLocal: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).run();

  await db.insert(models).values({
    id: SEED_MODEL_ID,
    providerId: SEED_PROVIDER_ID,
    name: SEED_MODEL_ID,
    displayName: 'Claude 3.5 Sonnet (test)',
    contextWindow: 200000,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    status: 'active',
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }).run();

  await db.insert(agents).values({
    id: SEED_AGENT_ID,
    name: 'Test agent',
    description: 'integration test fixture',
    persona: {
      tone: 'professional',
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.5,
      maxTokens: 1024,
      knowledgeBases: [],
    },
    tools: [],
    defaultModelId: SEED_MODEL_ID,
    memoryConfig: { strategy: 'sliding_window', maxMessages: 20 },
    rateLimit: 60,
    createdBy: 'local',
    isTemplate: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
  }).run();

  await db.insert(sessions).values({
    id: SEED_SESSION_ID,
    agentId: SEED_AGENT_ID,
    modelId: SEED_MODEL_ID,
    status: 'active',
    startedAt: now,
    metadata: {},
  }).run();

  await setSetting('provider_api_keys', { [SEED_PROVIDER_ID]: 'sk-test-fake-key' });

  // Reset the cached ProviderManager so the new apiKey is picked up.
  const providerModule = await import('../../src/core/providers/index.js');
  providerModule.getProviderManager().clearCache();
}

beforeAll(async () => {
  await initDb();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  messagesCreate.mockReset();
  await reseed();
});

describe('executeMessage', () => {
  it('persists user + assistant messages and aggregates usage', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello back from Claude.' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await executeMessage({
      sessionId: SEED_SESSION_ID,
      userMessage: 'Hi there.',
    });

    expect(messagesCreate).toHaveBeenCalledTimes(1);

    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    // 100 × $3/M + 50 × $15/M = 0.0003 + 0.00075 = 0.00105
    expect(result.costUsd).toBeCloseTo(0.00105, 8);
    expect(result.assistantMessage.content).toBe('Hello back from Claude.');

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, SEED_SESSION_ID))
      .all();
    expect(rows).toHaveLength(2);
    expect(rows[0].role).toBe('user');
    expect(rows[0].content).toBe('Hi there.');
    expect(rows[1].role).toBe('assistant');
    expect(rows[1].costUsd).toBeCloseTo(0.00105, 8);
    expect(rows[1].tokenCount).toBe(50);

    const usage = await db.select().from(usageRecords).all();
    expect(usage).toHaveLength(1);
    expect(usage[0].agentId).toBe(SEED_AGENT_ID);
    expect(usage[0].modelId).toBe(SEED_MODEL_ID);
    expect(usage[0].inputTokens).toBe(100);
    expect(usage[0].outputTokens).toBe(50);
    expect(usage[0].requestCount).toBe(1);
    expect(usage[0].costUsd).toBeCloseTo(0.00105, 8);
  });

  it('rejects when no API key is configured for a cloud provider', async () => {
    await setSetting('provider_api_keys', {});

    await expect(
      executeMessage({ sessionId: SEED_SESSION_ID, userMessage: 'hello' }),
    ).rejects.toThrow();

    // Auth check runs before persistence — no user message should be saved.
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, SEED_SESSION_ID))
      .all();
    expect(rows).toHaveLength(0);
  });

  it('throws when the session does not exist', async () => {
    await expect(
      executeMessage({ sessionId: 'does-not-exist', userMessage: 'hi' }),
    ).rejects.toThrow(/session not found/i);
  });
});
