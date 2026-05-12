import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { providers } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export async function providersRouter(app: FastifyInstance) {
  // List all providers
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const allProviders = await db.select().from(providers).all();
      return reply.send({ success: true, data: allProviders });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch providers' } });
    }
  });

  // Get provider by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const provider = await db.select().from(providers).where(eq(providers.id, id)).get();
      if (!provider) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Provider not found' } });
      }
      return reply.send({ success: true, data: provider });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch provider' } });
    }
  });

  // Update provider status
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const { status } = request.body as { status?: 'active' | 'inactive' };

      const existing = await db.select().from(providers).where(eq(providers.id, id)).get();
      if (!existing) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Provider not found' } });
      }

      if (status) {
        await db.update(providers).set({ status, updatedAt: new Date() }).where(eq(providers.id, id)).run();
      }

      const updated = await db.select().from(providers).where(eq(providers.id, id)).get();
      return reply.send({ success: true, data: updated });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to update provider' } });
    }
  });
}