import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { sessions, messages, agents, models } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { executeMessage, executeMessageStream } from '../core/agents/executor.js';
import { getSetting } from '../core/settings/index.js';
import { InvalidInputError, NotFoundError } from '../core/errors.js';

export async function sessionsRouter(app: FastifyInstance) {
  // List sessions
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { status, agentId, limit = '50', offset = '0' } = request.query as {
      status?: string;
      agentId?: string;
      limit?: string;
      offset?: string;
    };

    const all = await db.select().from(sessions).orderBy(desc(sessions.startedAt)).all();
    let filtered = all;
    if (status) filtered = filtered.filter((s) => s.status === status);
    if (agentId) filtered = filtered.filter((s) => s.agentId === agentId);

    const total = filtered.length;
    const start = Number(offset);
    const end = start + Number(limit);
    const page = filtered.slice(start, end);

    return reply.send({ success: true, data: page, total });
  });

  // Create session
  app.post<{ Body: { agentId: string; modelId?: string } }>('/', async (request, reply) => {
    const body = request.body ?? ({} as { agentId?: string; modelId?: string });
    if (!body.agentId) {
      throw new InvalidInputError('agentId is required');
    }

    const agent = await db.select().from(agents).where(eq(agents.id, body.agentId)).get();
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${body.agentId}`, 'agent');
    }

    let modelId = body.modelId ?? agent.defaultModelId;
    if (!modelId) {
      const defaultFromSettings = await getSetting('default_model_id');
      if (!defaultFromSettings) {
        throw new InvalidInputError(
          'No model resolved: pass modelId, set agent.defaultModelId, or settings.default_model_id',
        );
      }
      modelId = defaultFromSettings;
    }

    const model = await db.select().from(models).where(eq(models.id, modelId)).get();
    if (!model) {
      throw new NotFoundError(`Model not found: ${modelId}`, 'model');
    }

    const now = new Date();
    const newSession = {
      id: nanoid(),
      agentId: body.agentId,
      modelId,
      status: 'active' as const,
      startedAt: now,
      metadata: {},
    };
    await db.insert(sessions).values(newSession).run();

    return reply.code(201).send({ success: true, data: newSession });
  });

  // Recent sessions (for dashboard home)
  app.get<{ Querystring: { limit?: string } }>('/recent', async (request) => {
    const limit = Math.max(1, Math.min(50, Number(request.query.limit ?? '5')));
    const all = await db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.startedAt))
      .limit(limit)
      .all();

    // Attach agent name for display.
    const agentRows = await db.select().from(agents).all();
    const agentNameById = new Map(agentRows.map((a) => [a.id, a.name]));
    const enriched = all.map((s) => ({
      ...s,
      agentName: agentNameById.get(s.agentId) ?? null,
    }));
    return { success: true, data: enriched };
  });

  // Get session by id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!session) {
      throw new NotFoundError(`Session not found: ${id}`, 'session');
    }
    const agent = await db.select().from(agents).where(eq(agents.id, session.agentId)).get();
    return reply.send({
      success: true,
      data: { ...session, agent: agent ? { id: agent.id, name: agent.name } : null },
    });
  });

  // Get session messages
  app.get<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, id))
      .orderBy(messages.createdAt)
      .all();
    return reply.send({ success: true, data: rows });
  });

  // Send a message in a session
  app.post<{ Params: { id: string }; Body: { content?: string } }>(
    '/:id/messages',
    async (request, reply) => {
      const { id } = request.params;
      const content = request.body?.content;
      if (!content?.trim()) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'content is required' },
        });
      }

      const result = await executeMessage({ sessionId: id, userMessage: content });
      return reply.code(201).send({ success: true, data: result });
    },
  );

  // Send a message and stream the reply token-by-token over Server-Sent Events.
  // This path does not run the tool loop — callers route tool-using agents to
  // the blocking POST /:id/messages endpoint above.
  app.post<{ Params: { id: string }; Body: { content?: string } }>(
    '/:id/messages/stream',
    async (request, reply) => {
      const { id } = request.params;
      const content = request.body?.content;
      // Validate before hijacking so a bad request still gets a JSON error.
      if (!content?.trim()) {
        throw new InvalidInputError('content is required');
      }

      // Take over the raw socket — Fastify will not touch the response.
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const send = (event: unknown) => raw.write(`data: ${JSON.stringify(event)}\n\n`);

      try {
        for await (const event of executeMessageStream({
          sessionId: id,
          userMessage: content,
        })) {
          send(event);
        }
      } catch (err) {
        request.log.error(err);
        send({ type: 'error', message: (err as Error).message });
      }
      raw.end();
    },
  );

  // End session
  app.post<{ Params: { id: string } }>('/:id/end', async (request, reply) => {
    const { id } = request.params;
    const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!session) {
      throw new NotFoundError(`Session not found: ${id}`, 'session');
    }
    await db
      .update(sessions)
      .set({ status: 'completed', endedAt: new Date() })
      .where(eq(sessions.id, id))
      .run();
    const updated = await db.select().from(sessions).where(eq(sessions.id, id)).get();
    return reply.send({ success: true, data: updated });
  });
}
