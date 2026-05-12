import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { models, providers } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

export async function modelsRouter(app: FastifyInstance) {
  // List all models
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const allModels = await db.select().from(models).all();
      return reply.send({ success: true, data: allModels });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch models' } });
    }
  });

  // Get models by provider
  app.get<{ Params: { providerId: string } }>('/provider/:providerId', async (request, reply) => {
    try {
      const { providerId } = request.params;
      const providerModels = await db.select().from(models).where(eq(models.providerId, providerId)).all();
      return reply.send({ success: true, data: providerModels });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch models' } });
    }
  });

  // Get model by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const model = await db.select().from(models).where(eq(models.id, id)).get();
      if (!model) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Model not found' } });
      }
      return reply.send({ success: true, data: model });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch model' } });
    }
  });

  // Update model status
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const { status } = request.body as { status?: 'active' | 'beta' | 'deprecated' };

      const existing = await db.select().from(models).where(eq(models.id, id)).get();
      if (!existing) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Model not found' } });
      }

      if (status) {
        await db.update(models).set({ status, updatedAt: new Date() }).where(eq(models.id, id)).run();
      }

      const updated = await db.select().from(models).where(eq(models.id, id)).get();
      return reply.send({ success: true, data: updated });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to update model' } });
    }
  });
}