import type { FastifyInstance } from 'fastify';
import { getAgentManager, getMemoryManager } from '../core/agents/agent-manager.js';
import { getToolRegistry } from '../core/agents/tool-registry.js';
import { PERSONA_PRESETS, MEMORY_STRATEGIES } from '../core/agents/types.js';
import { db } from '../db/index.js';
import { usageRecords } from '../db/schema.js';
import { InvalidInputError, NotFoundError } from '../core/errors.js';

function asInvalidInput(error: unknown): InvalidInputError {
  return new InvalidInputError(error instanceof Error ? error.message : 'Invalid agent input');
}

export async function agentsRouter(app: FastifyInstance) {
  const agentManager = getAgentManager();
  const toolRegistry = getToolRegistry();

  // List all agents
  app.get('/', async request => {
    const {
      createdBy,
      tags,
      limit = '50',
      offset = '0',
    } = request.query as {
      createdBy?: string;
      tags?: string;
      limit?: string;
      offset?: string;
    };

    const pageSize = Math.max(1, Math.min(100, Number(limit)));
    const start = Math.max(0, Number(offset));
    const allAgents = await agentManager.list({
      createdBy,
      tags: tags?.split(',').filter(Boolean),
    });

    return {
      success: true,
      data: allAgents.slice(start, start + pageSize),
      total: allAgents.length,
      page: Math.floor(start / pageSize) + 1,
      pageSize,
    };
  });

  // Create agent
  app.post('/', async (request, reply) => {
    const body = request.body as {
      name?: string;
      description?: string;
      persona?: Parameters<typeof agentManager.create>[0]['persona'];
      tools?: string[];
      defaultModelId?: string;
      fallbackModelId?: string;
      memoryConfig?: Parameters<typeof agentManager.create>[0]['memoryConfig'];
      rateLimit?: number;
      tags?: string[];
      createdBy?: string;
    };

    if (!body?.name?.trim()) {
      throw new InvalidInputError('name is required');
    }

    try {
      const agent = await agentManager.create({
        name: body.name.trim(),
        description: body.description,
        persona: body.persona,
        tools: body.tools,
        defaultModelId: body.defaultModelId,
        fallbackModelId: body.fallbackModelId,
        memoryConfig: body.memoryConfig,
        rateLimit: body.rateLimit,
        tags: body.tags,
        createdBy: body.createdBy ?? 'local',
      });

      return reply.code(201).send({ success: true, data: agent });
    } catch (error) {
      throw asInvalidInput(error);
    }
  });

  // Top agents by recent usage (for dashboard home)
  app.get<{ Querystring: { limit?: string } }>('/top', async request => {
    const limit = Math.max(1, Math.min(50, Number(request.query.limit ?? '5')));
    const allUsage = await db.select().from(usageRecords).all();
    const allAgents = await agentManager.list();

    const totals = new Map<
      string,
      { agentId: string; cost: number; tokens: number; requests: number }
    >();
    for (const record of allUsage) {
      const slot = totals.get(record.agentId) ?? {
        agentId: record.agentId,
        cost: 0,
        tokens: 0,
        requests: 0,
      };
      slot.cost += record.costUsd;
      slot.tokens += record.totalTokens;
      slot.requests += record.requestCount;
      totals.set(record.agentId, slot);
    }

    const ranked = Array.from(totals.values())
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit)
      .map(total => {
        const agent = allAgents.find(a => a.id === total.agentId);
        return {
          agentId: total.agentId,
          name: agent?.name ?? total.agentId,
          requestCount: total.requests,
          tokens: total.tokens,
          cost: total.cost,
        };
      });

    return { success: true, data: ranked };
  });

  // Get persona presets
  app.get('/persona-presets', async () => ({
    success: true,
    data: Object.entries(PERSONA_PRESETS).map(([key, value]) => ({
      id: key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      ...value,
    })),
  }));

  // Get memory strategies
  app.get('/memory-strategies', async () => ({
    success: true,
    data: Object.entries(MEMORY_STRATEGIES).map(([key, value]) => ({
      id: key,
      ...value,
    })),
  }));

  // Get available tools
  app.get('/tools', async () => {
    const tools = toolRegistry.getAll();
    return {
      success: true,
      data: tools.map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
        requiresApproval: tool.requiresApproval,
      })),
    };
  });

  // Get agent by ID
  app.get<{ Params: { id: string } }>('/:id', async request => {
    const { id } = request.params;
    const agent = await agentManager.get(id);
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${id}`, 'agent');
    }

    return {
      success: true,
      data: {
        ...agent,
        tools: agentManager.getAgentTools(agent),
        capabilities: agentManager.getAgentCapabilities(agent),
      },
    };
  });

  // Update agent
  app.put<{ Params: { id: string } }>('/:id', async request => {
    const { id } = request.params;
    const existing = await agentManager.get(id);
    if (!existing) {
      throw new NotFoundError(`Agent not found: ${id}`, 'agent');
    }

    try {
      const agent = await agentManager.update(
        id,
        request.body as Parameters<typeof agentManager.update>[1]
      );
      return { success: true, data: agent };
    } catch (error) {
      throw asInvalidInput(error);
    }
  });

  // Delete agent
  app.delete<{ Params: { id: string } }>('/:id', async request => {
    const { id } = request.params;
    const deleted = await agentManager.delete(id);
    if (!deleted) {
      throw new NotFoundError(`Agent not found: ${id}`, 'agent');
    }
    return { success: true, data: { deleted: true, id } };
  });

  // Clone agent
  app.post<{ Params: { id: string } }>('/:id/clone', async (request, reply) => {
    const { id } = request.params;
    const { name, createdBy } = request.body as { name?: string; createdBy?: string };
    if (!name?.trim()) {
      throw new InvalidInputError('name is required');
    }

    const cloned = await agentManager.clone(id, name.trim(), createdBy ?? 'local');
    if (!cloned) {
      throw new NotFoundError(`Agent not found: ${id}`, 'agent');
    }

    return reply.code(201).send({ success: true, data: cloned });
  });

  // Get agent memory stats
  app.get<{ Params: { id: string } }>('/:id/memory', async request => {
    const { id } = request.params;
    const { sessionId } = request.query as { sessionId?: string };
    if (!sessionId) {
      throw new InvalidInputError('sessionId is required');
    }

    const stats = await getMemoryManager().getMemoryStats(sessionId, id);
    return { success: true, data: stats };
  });
}
