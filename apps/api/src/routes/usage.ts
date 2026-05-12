import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { usageRecords, sessions, agents, models } from '../db/schema.js';
import { eq, desc, sql, and, gte, lte } from 'drizzle-orm';

export async function usageRouter(app: FastifyInstance) {
  // Get usage summary
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, startDate, endDate } = request.query as {
        userId?: string;
        startDate?: string;
        endDate?: string;
      };

      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get all usage records
      let records = await db.select().from(usageRecords).all();

      if (userId) {
        records = records.filter(r => r.userId === userId);
      }

      // Calculate summaries
      const calculatePeriod = (start: string, end: string) => {
        return records
          .filter(r => r.date >= start && r.date <= end)
          .reduce((acc, r) => ({
            tokens: acc.tokens + r.totalTokens,
            cost: acc.cost + r.costUsd,
            requests: acc.requests + r.requestCount,
          }), { tokens: 0, cost: 0, requests: 0 });
      };

      return reply.send({
        success: true,
        data: {
          today: calculatePeriod(today, today),
          week: calculatePeriod(weekAgo, today),
          month: calculatePeriod(monthAgo, today),
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch usage' } });
    }
  });

  // Get usage by agent
  app.get('/by-agent', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const records = await db.select().from(usageRecords).all();

      const byAgent = records.reduce((acc, r) => {
        if (!acc[r.agentId]) {
          acc[r.agentId] = { agentId: r.agentId, tokens: 0, cost: 0, requests: 0 };
        }
        acc[r.agentId].tokens += r.totalTokens;
        acc[r.agentId].cost += r.costUsd;
        acc[r.agentId].requests += r.requestCount;
        return acc;
      }, {} as Record<string, { agentId: string; tokens: number; cost: number; requests: number }>);

      return reply.send({ success: true, data: Object.values(byAgent) });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch usage' } });
    }
  });

  // Get usage by model
  app.get('/by-model', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const records = await db.select().from(usageRecords).all();

      const byModel = records.reduce((acc, r) => {
        if (!acc[r.modelId]) {
          acc[r.modelId] = { modelId: r.modelId, tokens: 0, cost: 0, requests: 0 };
        }
        acc[r.modelId].tokens += r.totalTokens;
        acc[r.modelId].cost += r.costUsd;
        acc[r.modelId].requests += r.requestCount;
        return acc;
      }, {} as Record<string, { modelId: string; tokens: number; cost: number; requests: number }>);

      return reply.send({ success: true, data: Object.values(byModel) });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch usage' } });
    }
  });

  // Get usage trends
  app.get('/trends', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { days = '7' } = request.query as { days?: string };
      const startDate = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      const records = await db.select().from(usageRecords).all();

      const trends = records
        .filter(r => r.date >= startDate && r.date <= today)
        .reduce((acc, r) => {
          if (!acc[r.date]) {
            acc[r.date] = { date: r.date, tokens: 0, cost: 0, requests: 0 };
          }
          acc[r.date].tokens += r.totalTokens;
          acc[r.date].cost += r.costUsd;
          acc[r.date].requests += r.requestCount;
          return acc;
        }, {} as Record<string, { date: string; tokens: number; cost: number; requests: number }>);

      return reply.send({
        success: true,
        data: Object.values(trends).sort((a, b) => a.date.localeCompare(b.date)),
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch trends' } });
    }
  });

  // Record usage (called after LLM calls)
  app.post('/record', async (request, reply) => {
    try {
      const body = request.body as {
        userId: string;
        agentId: string;
        modelId: string;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        latencyMs: number;
      };

      const date = new Date().toISOString().split('T')[0];

      // Check if record exists for today
      const existing = await db.select().from(usageRecords)
        .where(sql`user_id = ${body.userId} AND agent_id = ${body.agentId} AND model_id = ${body.modelId} AND date = ${date}`)
        .get();

      if (existing) {
        // Update existing record
        const newTokens = existing.totalTokens + body.inputTokens + body.outputTokens;
        const newCost = existing.costUsd + body.costUsd;
        const newRequests = existing.requestCount + 1;
        const newAvgLatency = ((existing.avgLatencyMs * existing.requestCount) + body.latencyMs) / newRequests;

        await db.update(usageRecords)
          .set({
            inputTokens: existing.inputTokens + body.inputTokens,
            outputTokens: existing.outputTokens + body.outputTokens,
            totalTokens: newTokens,
            costUsd: newCost,
            requestCount: newRequests,
            avgLatencyMs: newAvgLatency,
          })
          .where(eq(usageRecords.id, existing.id))
          .run();
      } else {
        // Create new record
        await db.insert(usageRecords).values({
          id: crypto.randomUUID(),
          userId: body.userId,
          agentId: body.agentId,
          modelId: body.modelId,
          date,
          inputTokens: body.inputTokens,
          outputTokens: body.outputTokens,
          totalTokens: body.inputTokens + body.outputTokens,
          costUsd: body.costUsd,
          requestCount: 1,
          avgLatencyMs: body.latencyMs,
          createdAt: new Date(),
        }).run();
      }

      return reply.send({ success: true, data: { recorded: true, date } });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to record usage' } });
    }
  });
}