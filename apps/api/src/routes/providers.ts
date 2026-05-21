import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { providers, models } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getProviderManager } from '../core/providers/index.js';
import { getSetting } from '../core/settings/index.js';
import { InvalidInputError, NotFoundError } from '../core/errors.js';

export async function providersRouter(app: FastifyInstance) {
  // List all providers
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const all = await db.select().from(providers).all();
    return reply.send({ success: true, data: all });
  });

  // Get provider by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const provider = await db.select().from(providers).where(eq(providers.id, id)).get();
    if (!provider) throw new NotFoundError(`Provider not found: ${id}`, 'provider');
    return reply.send({ success: true, data: provider });
  });

  // Update provider status
  app.patch<{ Params: { id: string }; Body: { status?: 'active' | 'inactive' } }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { status } = request.body ?? {};
      const existing = await db.select().from(providers).where(eq(providers.id, id)).get();
      if (!existing) throw new NotFoundError(`Provider not found: ${id}`, 'provider');
      if (status) {
        await db
          .update(providers)
          .set({ status, updatedAt: new Date() })
          .where(eq(providers.id, id))
          .run();
      }
      const updated = await db.select().from(providers).where(eq(providers.id, id)).get();
      return reply.send({ success: true, data: updated });
    },
  );

  // POST /api/providers/:id/test — verify the stored API key works
  app.post<{ Params: { id: string } }>('/:id/test', async (request, reply) => {
    const { id } = request.params;
    const provider = await db.select().from(providers).where(eq(providers.id, id)).get();
    if (!provider) throw new NotFoundError(`Provider not found: ${id}`, 'provider');

    const apiKeys = (await getSetting('provider_api_keys')) ?? {};
    const apiKey = apiKeys[id];

    if (!provider.isLocal && !apiKey) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NO_API_KEY', message: 'No API key configured for this provider' },
      });
    }

    // Find a model to send a minimal request with.
    const model = await db.select().from(models).where(eq(models.providerId, id)).get();
    if (!model) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NO_MODEL', message: 'No model registered for this provider' },
      });
    }

    const manager = getProviderManager();
    if (apiKey) manager.configure(id, { apiKey });
    const llm = manager.getProvider(id);
    if (!llm) {
      return reply.code(500).send({
        success: false,
        error: { code: 'NO_IMPL', message: `No provider implementation for ${id}` },
      });
    }

    try {
      const startedAt = Date.now();
      const result = await llm.chat({
        model: model.name,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        maxTokens: 10,
        temperature: 0,
      });
      return reply.send({
        success: true,
        data: {
          ok: true,
          latencyMs: Date.now() - startedAt,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
      });
    } catch (err) {
      return reply.send({
        success: true,
        data: { ok: false, error: (err as Error).message },
      });
    }
  });

  // GET /api/providers/:id/local-models — probe a local provider for its
  // currently-loaded models. Only meaningful for Ollama / LM Studio.
  app.get<{ Params: { id: string } }>('/:id/local-models', async (request, reply) => {
    const { id } = request.params;
    const provider = await db.select().from(providers).where(eq(providers.id, id)).get();
    if (!provider) throw new NotFoundError(`Provider not found: ${id}`, 'provider');
    if (!provider.isLocal) {
      throw new InvalidInputError(`Provider is not local: ${id}`);
    }

    try {
      let discovered: Array<{ id: string; contextWindow?: number }> = [];

      if (id === 'lmstudio') {
        // OpenAI-compatible: GET /v1/models → { data: [{ id, ... }] }
        const res = await fetch(`${provider.baseUrl}/v1/models`);
        if (!res.ok) {
          return reply.send({
            success: true,
            data: { ok: false, error: `LM Studio returned HTTP ${res.status}` },
          });
        }
        const body = (await res.json()) as { data?: Array<{ id: string }> };
        discovered = (body.data ?? []).map((m) => ({ id: m.id }));
      } else if (id === 'ollama') {
        // GET /api/tags → { models: [{ name, ... }] }
        const res = await fetch(`${provider.baseUrl}/api/tags`);
        if (!res.ok) {
          return reply.send({
            success: true,
            data: { ok: false, error: `Ollama returned HTTP ${res.status}` },
          });
        }
        const body = (await res.json()) as { models?: Array<{ name: string }> };
        discovered = (body.models ?? []).map((m) => ({ id: m.name }));
      } else {
        return reply.send({
          success: true,
          data: { ok: false, error: `Discovery not implemented for ${id}` },
        });
      }

      return reply.send({ success: true, data: { ok: true, models: discovered } });
    } catch (err) {
      return reply.send({
        success: true,
        data: { ok: false, error: (err as Error).message },
      });
    }
  });

  // POST /api/providers/:id/register-model — register a discovered local model
  // into the `models` table so the rest of the app can refer to it.
  app.post<{
    Params: { id: string };
    Body: {
      name: string;
      displayName?: string;
      contextWindow?: number;
      supportsFunctionCalling?: boolean;
    };
  }>(
    '/:id/register-model',
    async (request, reply) => {
      const { id } = request.params;
      const { name, displayName, contextWindow, supportsFunctionCalling } =
        request.body ?? ({} as { name?: string });
      if (!name) throw new InvalidInputError('name is required');

      const provider = await db.select().from(providers).where(eq(providers.id, id)).get();
      if (!provider) throw new NotFoundError(`Provider not found: ${id}`, 'provider');

      // Stable ID derived from provider + name. Re-registering an existing
      // model updates the fields the caller supplied (e.g. toggling function
      // calling) rather than silently returning the stale row.
      const modelId = `${id}:${name}`;
      const existing = await db.select().from(models).where(eq(models.id, modelId)).get();
      if (existing) {
        const patch: Partial<typeof models.$inferInsert> = { updatedAt: new Date() };
        if (displayName !== undefined) patch.displayName = displayName;
        if (contextWindow !== undefined) patch.contextWindow = contextWindow;
        if (supportsFunctionCalling !== undefined) {
          patch.supportsFunctionCalling = supportsFunctionCalling;
        }
        await db.update(models).set(patch).where(eq(models.id, modelId)).run();
        const updated = await db.select().from(models).where(eq(models.id, modelId)).get();
        return reply.send({ success: true, data: updated });
      }

      const now = new Date();
      const row = {
        id: modelId,
        providerId: id,
        name,
        displayName: displayName ?? name,
        contextWindow: contextWindow ?? 8192,
        inputCostPer1M: 0,
        outputCostPer1M: 0,
        supportsStreaming: true,
        supportsVision: false,
        // Default true: most modern local models accept the OpenAI tools
        // param, and the executor only sends tools when the agent has any.
        supportsFunctionCalling: supportsFunctionCalling ?? true,
        status: 'active' as const,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(models).values(row).run();
      return reply.code(201).send({ success: true, data: row });
    },
  );
}
