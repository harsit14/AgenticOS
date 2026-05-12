import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { sessions, messages, agents, models, usageRecords } from '../db/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getAgentExecutor } from '../core/agents/executor.js';
import type { ChatMessage } from '@agentic-os/types';

export async function sessionsRouter(app: FastifyInstance) {
  const executor = getAgentExecutor();

  // List sessions
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status, agentId, limit = '50', offset = '0' } = request.query as {
        status?: string;
        agentId?: string;
        limit?: string;
        offset?: string;
      };

      const allSessions = await db.select().from(sessions).orderBy(desc(sessions.startedAt)).all();

      // Filter in memory (SQLite doesn't support complex where clauses well)
      let filtered = allSessions;
      if (status) {
        filtered = filtered.filter(s => s.status === status);
      }
      if (agentId) {
        filtered = filtered.filter(s => s.agentId === agentId);
      }

      const total = filtered.length;
      filtered = filtered.slice(Number(offset), Number(offset) + Number(limit));

      return reply.send({ success: true, data: filtered, total });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch sessions' } });
    }
  });

  // Create session
  app.post('/', async (request, reply) => {
    try {
      const body = request.body as { agentId: string; userId: string; modelId?: string };
      const now = new Date();

      // Get agent's default model if not specified
      let modelId = body.modelId;
      if (!modelId) {
        const agent = await db.select().from(agents).where(eq(agents.id, body.agentId)).get();
        modelId = agent?.defaultModelId || 'claude-3-5-sonnet';
      }

      const newSession = {
        id: nanoid(),
        agentId: body.agentId,
        userId: body.userId,
        modelId,
        status: 'active' as const,
        startedAt: now,
        metadata: {},
      };

      await db.insert(sessions).values(newSession).run();

      return reply.code(201).send({ success: true, data: newSession });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to create session' } });
    }
  });

  // Get session by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
      if (!session) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }

      // Get agent info for response
      const agent = await db.select().from(agents).where(eq(agents.id, session.agentId)).get();

      return reply.send({
        success: true,
        data: {
          ...session,
          agent: agent ? { id: agent.id, name: agent.name } : null,
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch session' } });
    }
  });

  // Get session messages
  app.get<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    try {
      const { id } = request.params;
      const sessionMessages = await db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(messages.createdAt).all();
      return reply.send({ success: true, data: sessionMessages });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch messages' } });
    }
  });

  // Send message in session (with LLM integration)
  app.post<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    try {
      const { id } = request.params;
      const body = request.body as { content: string; role?: string };

      const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
      if (!session) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }

      // Get agent config
      const agent = await db.select().from(agents).where(eq(agents.id, session.agentId)).get();
      if (!agent) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      // Get previous messages for context
      const previousMessages = await db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(messages.createdAt).all();

      // Build message history
      const messageHistory: ChatMessage[] = previousMessages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Add user message
      const userMessage = {
        id: nanoid(),
        sessionId: id,
        role: 'user' as const,
        content: body.content,
        modelId: session.modelId,
        latencyMs: 0,
        costUsd: 0,
        createdAt: new Date(),
      };
      await db.insert(messages).values(userMessage).run();

      // Execute LLM call
      try {
        const persona = agent.persona as { systemPrompt?: string; temperature?: number };
        const result = await executor.execute(messageHistory, {
          modelId: session.modelId,
          systemPrompt: persona?.systemPrompt || 'You are a helpful AI assistant.',
          temperature: persona?.temperature ?? 0.7,
          maxTokens: 4096,
        });

        // Store assistant response
        const assistantMessage = {
          id: nanoid(),
          sessionId: id,
          role: 'assistant' as const,
          content: result.content,
          tokenCount: result.usage.totalTokens,
          modelId: session.modelId,
          latencyMs: result.latencyMs,
          costUsd: result.costUsd,
          createdAt: new Date(),
        };
        await db.insert(messages).values(assistantMessage).run();

        // Record usage
        const today = new Date().toISOString().split('T')[0];
        const existingUsage = await db.select().from(usageRecords)
          .where(sql`user_id = ${session.userId} AND agent_id = ${session.agentId} AND model_id = ${session.modelId} AND date = ${today}`)
          .get();

        if (existingUsage) {
          const newCount = existingUsage.requestCount + 1;
          const newAvgLatency = ((existingUsage.avgLatencyMs * existingUsage.requestCount) + result.latencyMs) / newCount;
          await db.update(usageRecords).set({
            inputTokens: existingUsage.inputTokens + result.usage.inputTokens,
            outputTokens: existingUsage.outputTokens + result.usage.outputTokens,
            totalTokens: existingUsage.totalTokens + result.usage.totalTokens,
            costUsd: existingUsage.costUsd + result.costUsd,
            requestCount: newCount,
            avgLatencyMs: newAvgLatency,
          }).where(eq(usageRecords.id, existingUsage.id)).run();
        } else {
          await db.insert(usageRecords).values({
            id: nanoid(),
            userId: session.userId,
            agentId: session.agentId,
            modelId: session.modelId,
            date: today,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            costUsd: result.costUsd,
            requestCount: 1,
            avgLatencyMs: result.latencyMs,
            createdAt: new Date(),
          }).run();
        }

        return reply.code(201).send({ success: true, data: assistantMessage });
      } catch (llmError) {
        // LLM call failed - store error message
        const errorMessage = {
          id: nanoid(),
          sessionId: id,
          role: 'assistant' as const,
          content: `Error: ${(llmError as Error).message}`,
          tokenCount: 0,
          modelId: session.modelId,
          latencyMs: 0,
          costUsd: 0,
          createdAt: new Date(),
        };
        await db.insert(messages).values(errorMessage).run();

        // Update session status
        await db.update(sessions).set({ status: 'error' }).where(eq(sessions.id, id)).run();

        return reply.code(500).send({
          success: false,
          error: { code: 'LLM_ERROR', message: (llmError as Error).message },
        });
      }
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to send message' } });
    }
  });

  // Stream message (SSE) with LLM integration
  app.get<{ Params: { id: string } }>('/:id/stream', async (request, reply) => {
    const { id } = request.params;

    try {
      const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
      if (!session) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }

      const agent = await db.select().from(agents).where(eq(agents.id, session.agentId)).get();
      if (!agent) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      // Get previous messages
      const previousMessages = await db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(messages.createdAt).all();

      const messageHistory: ChatMessage[] = previousMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const persona = agent.persona as { systemPrompt?: string; temperature?: number };

      // Set up SSE
      reply.raw?.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      let fullContent = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      await executor.stream(messageHistory, {
        modelId: session.modelId,
        systemPrompt: persona?.systemPrompt || 'You are a helpful AI assistant.',
        temperature: persona?.temperature ?? 0.7,
        maxTokens: 4096,
      }, {
        onContent: (content) => {
          fullContent += content;
          reply.raw?.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
        },
        onDone: (usage) => {
          totalInputTokens = usage.inputTokens;
          totalOutputTokens = usage.outputTokens;
        },
        onError: (error) => {
          reply.raw?.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
        },
      });

      // Store final message and usage
      if (fullContent) {
        const assistantMessage = {
          id: nanoid(),
          sessionId: id,
          role: 'assistant' as const,
          content: fullContent,
          tokenCount: totalInputTokens + totalOutputTokens,
          modelId: session.modelId,
          latencyMs: 0, // Would need to track this properly
          costUsd: 0,
          createdAt: new Date(),
        };
        await db.insert(messages).values(assistantMessage).run();
      }

      reply.raw?.write(`data: ${JSON.stringify({
        type: 'done',
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens },
      })}\n\n`);

      reply.raw?.end();
    } catch (error) {
      reply.raw?.write(`data: ${JSON.stringify({ type: 'error', error: (error as Error).message })}\n\n`);
      reply.raw?.end();
    }
  });

  // End session
  app.post<{ Params: { id: string } }>('/:id/end', async (request, reply) => {
    try {
      const { id } = request.params;
      const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
      if (!session) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }

      await db.update(sessions).set({ status: 'completed', endedAt: new Date() }).where(eq(sessions.id, id)).run();

      const updated = await db.select().from(sessions).where(eq(sessions.id, id)).get();
      return reply.send({ success: true, data: updated });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to end session' } });
    }
  });
}