import type {
  ChatMessage,
  ChatParams,
  Message,
  ToolCall,
  ToolDefinition,
  UsageInfo,
} from '@agentic-os/types';
import { countTokens } from '@agentic-os/types';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import { agents, messages, models, providers, sessions, usageRecords } from '../../db/schema.js';
import { getProviderManager } from '../providers/index.js';
import { AuthenticationError } from '../providers/types.js';
import type { LLMProvider } from '../providers/types.js';
import { calculateCost } from '../cost/calculate.js';
import { getSetting } from '../settings/index.js';
import { ConfigurationError, InvalidInputError, NotFoundError } from '../errors.js';
import { recordRequest, withSpan } from '../../telemetry/index.js';
import { getToolRegistry } from './tool-registry.js';

type MessageRow = typeof messages.$inferInsert;
type SessionRow = typeof sessions.$inferSelect;

export interface ExecuteMessageParams {
  sessionId: string;
  userMessage: string;
}

export interface ExecuteMessageResult {
  userMessage: Message;
  assistantMessage: Message;
  usage: UsageInfo;
  costUsd: number;
  /** Number of tool-calling rounds taken before the final answer. */
  toolSteps: number;
}

/** Events emitted by the streaming turn path. */
export type StreamExecEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; messageId: string; usage: UsageInfo; costUsd: number }
  | { type: 'error'; message: string };

// Tool loop bounds. A step is one LLM call that requested tools.
const MAX_TOOL_STEPS = 8;
const MAX_LOOP_WALL_MS = 120_000;
// Tool output fed back to the model is capped so a chatty tool can't blow the
// context window.
const MAX_TOOL_RESULT_CHARS = 4000;

function truncate(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  return text.length > max
    ? `${text.slice(0, max)}… [truncated ${text.length - max} chars]`
    : text;
}

/**
 * Run one tool call the model asked for and return the text to feed back.
 * The agent may only use tools it was configured with; approval-gated tools
 * are skipped (there is no approval queue in v1).
 */
async function runToolCall(
  call: ToolCall,
  agentTools: ToolDefinition[],
  ctx: { sessionId: string; agentId: string },
): Promise<string> {
  const allowed = agentTools.find((t) => t.id === call.name);
  if (!allowed) {
    return `Error: tool "${call.name}" is not available to this agent.`;
  }
  if (allowed.requiresApproval) {
    return `Error: tool "${call.name}" requires manual approval and was skipped.`;
  }

  let args: unknown;
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    return `Error: tool "${call.name}" was called with invalid JSON arguments.`;
  }

  const result = await getToolRegistry().execute(call.name, args, ctx);
  if (result.success) {
    return truncate(result.content || '(tool returned no output)');
  }
  return truncate(`Error: ${result.error ?? 'tool execution failed'}`);
}

// ---------------------------------------------------------------------------
// Shared turn setup
// ---------------------------------------------------------------------------

interface PreparedTurn {
  session: SessionRow;
  agent: typeof agents.$inferSelect;
  model: typeof models.$inferSelect;
  provider: typeof providers.$inferSelect;
  modelId: string;
  llm: LLMProvider;
  history: ChatMessage[];
  trimmedMessages: number;
  agentTools: ToolDefinition[];
  toolsForLlm: ToolDefinition[] | undefined;
  userMessageRow: MessageRow;
  baseParams: Omit<ChatParams, 'messages' | 'tools'>;
}

/**
 * Shared setup for both the blocking and streaming turn paths:
 *   1. Load + validate session, agent, model, provider, API key.
 *   2. Build the conversation history and trim it to the context budget.
 *   3. Persist the user message (before any LLM call, so it survives a failure).
 *   4. Resolve the provider implementation.
 */
async function prepareTurn(sessionId: string, userContent: string): Promise<PreparedTurn> {
  // 1. Session
  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) {
    throw new NotFoundError(`Session not found: ${sessionId}`, 'session');
  }
  if (session.status !== 'active') {
    throw new ConfigurationError(`Session is not active: ${sessionId} (${session.status})`);
  }

  // 2. Agent
  const agent = await db.select().from(agents).where(eq(agents.id, session.agentId)).get();
  if (!agent) {
    throw new NotFoundError(`Agent not found: ${session.agentId}`, 'agent');
  }

  // 3. Resolve model id: session.modelId > agent.defaultModelId > settings.default_model_id
  const defaultFromSettings = await getSetting('default_model_id');
  const modelId = session.modelId || agent.defaultModelId || defaultFromSettings;
  if (!modelId) {
    throw new ConfigurationError(
      'No model resolved: set session.modelId, agent.defaultModelId, or settings.default_model_id',
    );
  }

  // 4. Model + provider
  const model = await db.select().from(models).where(eq(models.id, modelId)).get();
  if (!model) {
    throw new NotFoundError(`Model not found: ${modelId}`, 'model');
  }
  const provider = await db.select().from(providers).where(eq(providers.id, model.providerId)).get();
  if (!provider) {
    throw new NotFoundError(`Provider not found: ${model.providerId}`, 'provider');
  }

  // 5. API key from settings (skip for local providers)
  const apiKeys = (await getSetting('provider_api_keys')) ?? {};
  const apiKey = apiKeys[provider.id];
  if (!apiKey && !provider.isLocal) {
    throw new AuthenticationError(provider.id);
  }

  // 6. Prior messages (oldest first), capped by the agent's memory window
  const memoryMax = agent.memoryConfig?.maxMessages ?? 50;
  const allPrior = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(messages.createdAt)
    .all();
  const priorWindow = allPrior.slice(-memoryMax);

  // Rebuild the conversation history. Tool-call plumbing (assistant tool_calls
  // + tool results) is not stored on the messages table, so we drop `tool`
  // rows and empty intermediate assistant rows — replaying them without their
  // ids would violate the OpenAI message format.
  const historyAll: ChatMessage[] = priorWindow
    .filter((m) => m.role !== 'tool')
    .filter((m) => !(m.role === 'assistant' && m.content.trim() === ''))
    .map((m) => ({
      role: m.role as ChatMessage['role'],
      content: m.content,
    }));

  // 6b. Token-budget trim:
  //   inputBudget = contextWindow − reservedForOutput − safetyMargin
  // Drop the OLDEST history messages until system prompt + history + the new
  // user message fit. If the system prompt + user message alone don't fit,
  // there is nothing to drop — fail with a clear error.
  const reservedOutput = agent.persona?.maxTokens ?? 4096;
  const SAFETY_MARGIN = 256;
  const inputBudget = Math.max(0, model.contextWindow - reservedOutput - SAFETY_MARGIN);
  const perMessageOverhead = 4; // role / formatting tokens
  const fixedTokens =
    countTokens(agent.persona?.systemPrompt ?? '', modelId) +
    countTokens(userContent, modelId) +
    perMessageOverhead * 2;
  if (fixedTokens > inputBudget) {
    throw new InvalidInputError(
      `Message too long for ${model.displayName}: the system prompt + your ` +
        `message need ~${fixedTokens} tokens but only ${inputBudget} fit ` +
        `(context window ${model.contextWindow}, ${reservedOutput} reserved for the reply).`,
    );
  }

  const history: ChatMessage[] = [...historyAll];
  let historyTokens = history.reduce(
    (sum, m) => sum + countTokens(m.content, modelId) + perMessageOverhead,
    0,
  );
  let trimmedMessages = 0;
  while (history.length > 0 && fixedTokens + historyTokens > inputBudget) {
    const dropped = history.shift()!;
    historyTokens -= countTokens(dropped.content, modelId) + perMessageOverhead;
    trimmedMessages++;
  }

  // 7. Decide whether tools are offered.
  const agentTools: ToolDefinition[] = agent.tools ?? [];
  const toolsEnabled = model.supportsFunctionCalling && agentTools.length > 0;
  const toolsForLlm = toolsEnabled ? agentTools : undefined;

  // 8. Persist the user message BEFORE the LLM call so it survives a failure.
  const userMessageRow: MessageRow = {
    id: nanoid(),
    sessionId,
    role: 'user',
    content: userContent,
    tokenCount: countTokens(userContent, modelId),
    modelId,
    latencyMs: 0,
    costUsd: 0,
    parentMessageId: priorWindow.at(-1)?.id ?? null,
    createdAt: new Date(),
  };
  await db.insert(messages).values(userMessageRow).run();

  // 9. Resolve the provider implementation.
  const manager = getProviderManager();
  if (apiKey) {
    manager.configure(provider.id, { apiKey });
  }
  const llm = manager.getProvider(provider.id);
  if (!llm) {
    throw new ConfigurationError(`No provider implementation for: ${provider.id}`);
  }

  const baseParams: Omit<ChatParams, 'messages' | 'tools'> = {
    model: model.name,
    systemPrompt: agent.persona?.systemPrompt,
    temperature: agent.persona?.temperature ?? 0.7,
    maxTokens: agent.persona?.maxTokens ?? 4096,
  };

  return {
    session,
    agent,
    model,
    provider,
    modelId,
    llm,
    history,
    trimmedMessages,
    agentTools,
    toolsForLlm,
    userMessageRow,
    baseParams,
  };
}

/** Upsert the per-agent/model/day usage record with a single indexed lookup. */
async function recordUsage(
  agentId: string,
  modelId: string,
  usage: UsageInfo,
  costUsd: number,
  latencyMs: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.agentId, agentId),
        eq(usageRecords.modelId, modelId),
        eq(usageRecords.date, today),
      ),
    )
    .get();

  if (existing) {
    const nextCount = existing.requestCount + 1;
    const nextAvgLatency =
      (existing.avgLatencyMs * existing.requestCount + latencyMs) / nextCount;
    await db
      .update(usageRecords)
      .set({
        inputTokens: existing.inputTokens + usage.inputTokens,
        outputTokens: existing.outputTokens + usage.outputTokens,
        totalTokens: existing.totalTokens + usage.totalTokens,
        costUsd: existing.costUsd + costUsd,
        requestCount: nextCount,
        avgLatencyMs: nextAvgLatency,
      })
      .where(eq(usageRecords.id, existing.id))
      .run();
  } else {
    await db
      .insert(usageRecords)
      .values({
        id: nanoid(),
        agentId,
        modelId,
        date: today,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        costUsd,
        requestCount: 1,
        avgLatencyMs: latencyMs,
        createdAt: new Date(),
      })
      .run();
  }
}

/** Record last-activity on the session (sessions has no updatedAt column). */
async function touchSession(session: SessionRow): Promise<void> {
  await db
    .update(sessions)
    .set({
      metadata: { ...(session.metadata ?? {}), lastActivityAt: new Date().toISOString() },
    })
    .where(eq(sessions.id, session.id))
    .run();
}

// ---------------------------------------------------------------------------
// Blocking turn — runs the bounded agentic tool loop
// ---------------------------------------------------------------------------

/**
 * Run a full user → assistant turn. If the agent has tools and the model
 * supports function calling, this runs a bounded tool loop; otherwise it is a
 * single LLM call. Persists every message and aggregates usage.
 */
export async function executeMessage(params: ExecuteMessageParams): Promise<ExecuteMessageResult> {
  return withSpan('agent.execute', (span) => executeMessageInner(params, span), {
    'session.id': params.sessionId,
  });
}

async function executeMessageInner(
  params: ExecuteMessageParams,
  span: import('@opentelemetry/api').Span,
): Promise<ExecuteMessageResult> {
  const { sessionId, userMessage: userContent } = params;
  const prepared = await prepareTurn(sessionId, userContent);
  const {
    session,
    agent,
    model,
    provider,
    modelId,
    llm,
    history,
    trimmedMessages,
    agentTools,
    toolsForLlm,
    userMessageRow,
    baseParams,
  } = prepared;

  if (trimmedMessages > 0) {
    span.setAttribute('context.trimmed_messages', trimmedMessages);
  }

  // Run the bounded tool loop. Each iteration is one LLM call; when the model
  // asks for tools we run them, append the results, and call again.
  const loopStartedAt = Date.now();
  let workingMessages: ChatMessage[] = [...history, { role: 'user', content: userContent }];
  let lastParentId: string = userMessageRow.id!;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let toolSteps = 0;
  let finalAssistantRow: MessageRow | null = null;

  for (let iteration = 0; ; iteration++) {
    // After the step budget is spent, make one last call with no tools so the
    // model is forced to produce a text answer.
    const offerTools =
      toolsForLlm &&
      iteration < MAX_TOOL_STEPS &&
      Date.now() - loopStartedAt < MAX_LOOP_WALL_MS;

    const stepStartedAt = Date.now();
    const response = await withSpan(
      'llm.chat',
      () =>
        llm.chat({
          ...baseParams,
          messages: workingMessages,
          tools: offerTools ? toolsForLlm : undefined,
        }),
      {
        'model.id': modelId,
        'provider.id': provider.id,
        'agent.id': agent.id,
        'llm.iteration': iteration,
      },
    );
    const stepLatency = Date.now() - stepStartedAt;
    const stepCost = calculateCost(
      model,
      response.usage.inputTokens,
      response.usage.outputTokens,
    );
    totalInput += response.usage.inputTokens;
    totalOutput += response.usage.outputTokens;
    totalCost += stepCost;

    recordRequest({
      provider: provider.id,
      model: modelId,
      status: 'success',
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      latencyMs: stepLatency,
      costUsd: stepCost,
    });

    const toolCalls = response.toolCalls ?? [];
    const wantsTools =
      offerTools && response.finishReason === 'tool_use' && toolCalls.length > 0;

    if (!wantsTools) {
      // Final answer — persist it and stop.
      finalAssistantRow = {
        id: nanoid(),
        sessionId,
        role: 'assistant',
        content: response.content,
        tokenCount: response.usage.outputTokens,
        modelId,
        latencyMs: stepLatency,
        costUsd: stepCost,
        parentMessageId: lastParentId,
        createdAt: new Date(),
      };
      await db.insert(messages).values(finalAssistantRow).run();
      break;
    }

    // Tool step: persist the assistant message that requested the tools.
    toolSteps++;
    const assistantToolRow: MessageRow = {
      id: nanoid(),
      sessionId,
      role: 'assistant',
      content: response.content,
      tokenCount: response.usage.outputTokens,
      modelId,
      latencyMs: stepLatency,
      costUsd: stepCost,
      parentMessageId: lastParentId,
      createdAt: new Date(),
    };
    await db.insert(messages).values(assistantToolRow).run();
    lastParentId = assistantToolRow.id!;
    workingMessages = [
      ...workingMessages,
      { role: 'assistant', content: response.content, toolCalls },
    ];

    // Execute each requested tool and feed the results back.
    for (const call of toolCalls) {
      const resultText = await runToolCall(call, agentTools, {
        sessionId,
        agentId: agent.id,
      });
      const toolRow: MessageRow = {
        id: nanoid(),
        sessionId,
        role: 'tool',
        content: resultText,
        tokenCount: countTokens(resultText, modelId),
        modelId,
        latencyMs: 0,
        costUsd: 0,
        parentMessageId: lastParentId,
        createdAt: new Date(),
      };
      await db.insert(messages).values(toolRow).run();
      lastParentId = toolRow.id!;
      workingMessages = [
        ...workingMessages,
        { role: 'tool', content: resultText, toolCallId: call.id },
      ];
    }
  }

  // finalAssistantRow is always set: the loop only breaks after assigning it.
  const assistantRow = finalAssistantRow!;
  const totalTokens = totalInput + totalOutput;
  const loopLatency = Date.now() - loopStartedAt;

  span.setAttributes({
    'agent.id': agent.id,
    'model.id': modelId,
    'provider.id': provider.id,
    'cost.usd': totalCost,
    'tokens.input': totalInput,
    'tokens.output': totalOutput,
    'tool.steps': toolSteps,
    'latency.ms': loopLatency,
  });

  await recordUsage(
    agent.id,
    modelId,
    { inputTokens: totalInput, outputTokens: totalOutput, totalTokens },
    totalCost,
    loopLatency,
  );
  await touchSession(session);

  return {
    userMessage: userMessageRow as Message,
    assistantMessage: assistantRow as Message,
    usage: { inputTokens: totalInput, outputTokens: totalOutput, totalTokens },
    costUsd: totalCost,
    toolSteps,
  };
}

// ---------------------------------------------------------------------------
// Streaming turn — single streamed LLM call, no tool loop
// ---------------------------------------------------------------------------

/**
 * Run a user → assistant turn, streaming the reply token-by-token. This path
 * does NOT run the tool loop — callers route tool-using agents to
 * executeMessage. Yields delta events, then a final done event after the
 * assistant message is persisted.
 */
export async function* executeMessageStream(
  params: ExecuteMessageParams,
): AsyncGenerator<StreamExecEvent> {
  const { sessionId, userMessage: userContent } = params;
  const prepared = await prepareTurn(sessionId, userContent);
  const { session, agent, model, provider, modelId, llm, history, userMessageRow, baseParams } =
    prepared;

  const convo: ChatMessage[] = [...history, { role: 'user', content: userContent }];
  const startedAt = Date.now();
  let acc = '';
  let usage: UsageInfo = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  try {
    for await (const ev of llm.streamChat({ ...baseParams, messages: convo })) {
      if (ev.type === 'content' && ev.content) {
        acc += ev.content;
        yield { type: 'delta', content: ev.content };
      } else if (ev.type === 'done' && ev.usage) {
        usage = ev.usage;
      } else if (ev.type === 'error') {
        yield { type: 'error', message: ev.error ?? 'stream error' };
        return;
      }
    }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    return;
  }

  const latencyMs = Date.now() - startedAt;
  // Some providers don't report token counts on the stream's done event.
  if (!usage.outputTokens) {
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = countTokens(acc, modelId);
    usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
  }
  const costUsd = calculateCost(model, usage.inputTokens, usage.outputTokens);

  const assistantRow: MessageRow = {
    id: nanoid(),
    sessionId,
    role: 'assistant',
    content: acc,
    tokenCount: usage.outputTokens,
    modelId,
    latencyMs,
    costUsd,
    parentMessageId: userMessageRow.id ?? null,
    createdAt: new Date(),
  };
  await db.insert(messages).values(assistantRow).run();

  recordRequest({
    provider: provider.id,
    model: modelId,
    status: 'success',
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    latencyMs,
    costUsd,
  });
  await recordUsage(agent.id, modelId, usage, costUsd, latencyMs);
  await touchSession(session);

  yield { type: 'done', messageId: assistantRow.id!, usage, costUsd };
}
