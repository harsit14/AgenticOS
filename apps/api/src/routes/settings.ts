import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { settings, budgetAlerts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function settingsRouter(app: FastifyInstance) {
  // Get all settings for user
  app.get<{ Params: { userId: string } }>('/:userId', async (request, reply) => {
    try {
      const { userId } = request.params;
      const userSettings = await db.select().from(settings).where(eq(settings.userId, userId)).get();

      if (!userSettings) {
        // Create default settings
        const now = new Date();
        const defaultSettings = {
          id: nanoid(),
          userId,
          theme: 'dark' as const,
          rateLimit: 100,
          budgetAlertsEnabled: true,
          systemPromptTemplates: [],
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(settings).values(defaultSettings).run();
        return reply.send({ success: true, data: defaultSettings });
      }

      return reply.send({ success: true, data: userSettings });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch settings' } });
    }
  });

  // Update settings
  app.put<{ Params: { userId: string } }>('/:userId', async (request, reply) => {
    try {
      const { userId } = request.params;
      const body = request.body as Record<string, unknown>;

      const existing = await db.select().from(settings).where(eq(settings.userId, userId)).get();

      if (!existing) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Settings not found' } });
      }

      const updated = {
        ...existing,
        ...body,
        updatedAt: new Date(),
      };

      await db.update(settings).set(updated).where(eq(settings.userId, userId)).run();

      return reply.send({ success: true, data: updated });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to update settings' } });
    }
  });

  // Get API keys status
  app.get('/keys', async (request, reply) => {
    return reply.send({
      success: true,
      data: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        azure: !!process.env.AZURE_OPENAI_KEY,
        vertex: !!process.env.VERTEX_AI_API_KEY,
        bedrock: !!process.env.AWS_ACCESS_KEY_ID,
        ollama: true, // Local, always available
        lmstudio: true,
        groq: !!process.env.GROQ_API_KEY,
        perplexity: !!process.env.PERPLEXITY_API_KEY,
        mistral: !!process.env.MISTRAL_API_KEY,
      },
    });
  });

  // Get budget alerts
  app.get<{ Params: { userId: string } }>('/:userId/budget', async (request, reply) => {
    try {
      const { userId } = request.params;
      const alerts = await db.select().from(budgetAlerts).where(eq(budgetAlerts.userId, userId)).all();
      return reply.send({ success: true, data: alerts });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch budget alerts' } });
    }
  });

  // Create/update budget alert
  app.post<{ Params: { userId: string } }>('/:userId/budget', async (request, reply) => {
    try {
      const { userId } = request.params;
      const body = request.body as { type: string; limitUsd: number };

      const now = new Date();
      const existing = await db.select().from(budgetAlerts)
        .where(eq(budgetAlerts.userId, userId))
        .all()
        .then(alerts => alerts.find(a => a.type === body.type));

      if (existing) {
        const updated = {
          ...existing,
          limitUsd: body.limitUsd,
          updatedAt: now,
        };
        await db.update(budgetAlerts).set(updated).where(eq(budgetAlerts.id, existing.id)).run();
        return reply.send({ success: true, data: updated });
      }

      const newAlert = {
        id: nanoid(),
        userId,
        type: body.type as 'daily' | 'weekly' | 'monthly' | 'threshold',
        limitUsd: body.limitUsd,
        currentSpend: 0,
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(budgetAlerts).values(newAlert).run();
      return reply.code(201).send({ success: true, data: newAlert });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to save budget alert' } });
    }
  });

  // Delete budget alert
  app.delete<{ Params: { userId: string; alertId: string } }>('/:userId/budget/:alertId', async (request, reply) => {
    try {
      const { alertId } = request.params;
      await db.delete(budgetAlerts).where(eq(budgetAlerts.id, alertId)).run();
      return reply.send({ success: true, data: { deleted: true, id: alertId } });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to delete budget alert' } });
    }
  });
}