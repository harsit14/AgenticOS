import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAgentManager, getMemoryManager } from '../core/agents/agent-manager.js';
import { getToolRegistry } from '../core/agents/tool-registry.js';
import { getAgentExporter, getAgentImporter } from '../core/agents/export-import.js';
import { getVersionManager } from '../core/agents/version-manager.js';
import { AGENT_TEMPLATES, PERSONA_PRESETS, MEMORY_STRATEGIES } from '../core/agents/types.js';
import { db } from '../db/index.js';
import { agents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function agentsRouter(app: FastifyInstance) {
  const agentManager = getAgentManager();
  const toolRegistry = getToolRegistry();
  const exporter = getAgentExporter();
  const importer = getAgentImporter();
  const versionManager = getVersionManager();

  // List all agents
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { createdBy, tags, isTemplate, limit = '50', offset = '0' } = request.query as {
        createdBy?: string;
        tags?: string;
        isTemplate?: string;
        limit?: string;
        offset?: string;
      };

      const allAgents = await agentManager.list({
        createdBy,
        tags: tags?.split(','),
        isTemplate: isTemplate === 'true' ? true : isTemplate === 'false' ? false : undefined,
      });

      const paginated = allAgents.slice(Number(offset), Number(offset) + Number(limit));

      return reply.send({
        success: true,
        data: paginated,
        total: allAgents.length,
        page: Math.floor(Number(offset) / Number(limit)) + 1,
        pageSize: Number(limit),
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch agents' } });
    }
  });

  // Create agent
  app.post('/', async (request, reply) => {
    try {
      const body = request.body as {
        name: string;
        description?: string;
        persona?: unknown;
        tools?: string[];
        defaultModelId?: string;
        fallbackModelId?: string;
        memoryConfig?: unknown;
        rateLimit?: number;
        tags?: string[];
        createdBy: string;
      };

      const agent = await agentManager.create({
        name: body.name,
        description: body.description,
        persona: body.persona as Parameters<typeof agentManager.create>[0]['persona'],
        tools: body.tools,
        defaultModelId: body.defaultModelId,
        fallbackModelId: body.fallbackModelId,
        memoryConfig: body.memoryConfig as Parameters<typeof agentManager.create>[0]['memoryConfig'],
        rateLimit: body.rateLimit,
        tags: body.tags,
        createdBy: body.createdBy,
      });

      // Auto-save initial version
      await versionManager.saveVersion(agent.id, JSON.stringify(agent), body.createdBy, 'Initial creation');

      return reply.code(201).send({ success: true, data: agent });
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: (error as Error).message } });
    }
  });

  // Get agent by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const agent = await agentManager.get(id);
      if (!agent) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      const tools = agentManager.getAgentTools(agent);
      const capabilities = agentManager.getAgentCapabilities(agent);

      return reply.send({
        success: true,
        data: { ...agent, tools, capabilities },
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch agent' } });
    }
  });

  // Update agent
  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const body = request.body as Record<string, unknown>;
      const { userId = 'system' } = request.body as { userId?: string };

      const existing = await agentManager.get(id);
      if (!existing) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      // Save version before update
      await versionManager.saveVersion(id, JSON.stringify(existing), userId, 'Before update');

      const agent = await agentManager.update(id, body);

      return reply.send({ success: true, data: agent });
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: (error as Error).message } });
    }
  });

  // Delete agent
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const deleted = await agentManager.delete(id);
      if (!deleted) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }
      return reply.send({ success: true, data: { deleted: true, id } });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to delete agent' } });
    }
  });

  // Clone agent
  app.post<{ Params: { id: string } }>('/:id/clone', async (request, reply) => {
    try {
      const { id } = request.params;
      const { name, createdBy } = request.body as { name: string; createdBy: string };

      const cloned = await agentManager.clone(id, name, createdBy);
      if (!cloned) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      return reply.code(201).send({ success: true, data: cloned });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to clone agent' } });
    }
  });

  // Get agent memory stats
  app.get<{ Params: { id: string } }>('/:id/memory', async (request, reply) => {
    try {
      const { id } = request.params;
      const { sessionId } = request.query as { sessionId?: string };

      if (!sessionId) {
        return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'sessionId is required' } });
      }

      const memoryManager = getMemoryManager();
      const stats = await memoryManager.getMemoryStats(sessionId, id);

      return reply.send({ success: true, data: stats });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch memory stats' } });
    }
  });

  // =====================
  // Export/Import Endpoints
  // =====================

  // Export single agent config
  app.get<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
    try {
      const { id } = request.params;
      const { format = 'json', includeVersionHistory = 'false' } = request.query as {
        format?: string;
        includeVersionHistory?: string;
      };

      const agent = await agentManager.get(id);
      if (!agent) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      const config = exporter.toFile(agent, format as 'json' | 'yaml');

      // Include version history if requested
      if (includeVersionHistory === 'true') {
        const history = await versionManager.getHistorySummary(id);
        return reply.send({
          success: true,
          data: {
            config,
            format,
            versionHistory: history,
          },
        });
      }

      return reply.send({
        success: true,
        data: config,
        format,
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to export agent' } });
    }
  });

  // Import single agent config
  app.post<{ Params: { id?: string } }>('/import', async (request, reply) => {
    try {
      const { config, createdBy, name, validateOnly = false } = request.body as {
        config: string | Record<string, unknown>;
        createdBy: string;
        name?: string;
        validateOnly?: boolean;
      };

      // Parse config if it's a string
      let parsedConfig: Record<string, unknown>;
      if (typeof config === 'string') {
        parsedConfig = importer.parse(config);
      } else {
        parsedConfig = config;
      }

      // Validate only mode
      if (validateOnly) {
        const errors = importer.getErrors();
        return reply.send({
          success: true,
          data: {
            valid: errors.length === 0,
            errors,
            config: parsedConfig,
          },
        });
      }

      // Import the config
      const params = importer.toCreateParams(parsedConfig as Parameters<typeof importer.toCreateParams>[0], {
        name,
        createdBy,
      });

      const agent = await agentManager.create(params);

      // Auto-save initial version
      await versionManager.saveVersion(agent.id, JSON.stringify(agent), createdBy, 'Imported from config');

      return reply.code(201).send({
        success: true,
        data: agent,
        importedAt: new Date().toISOString(),
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ success: false, error: { code: 'IMPORT_ERROR', message: (error as Error).message } });
    }
  });

  // Bulk export agents
  app.post('/export/bulk', async (request, reply) => {
    try {
      const { agentIds, format = 'json' } = request.body as {
        agentIds?: string[];
        format?: 'json' | 'yaml';
      };

      let agentsToExport;
      if (agentIds && agentIds.length > 0) {
        agentsToExport = await Promise.all(agentIds.map(id => agentManager.get(id)));
        agentsToExport = agentsToExport.filter(Boolean);
      } else {
        // Export all agents
        agentsToExport = await agentManager.list();
      }

      if (agentsToExport.length === 0) {
        return reply.send({ success: true, data: { agents: [], totalCount: 0 } });
      }

      const result = exporter.exportMany(agentsToExport as Parameters<typeof exporter.exportMany>[0]);

      return reply.send({
        success: true,
        data: result,
        format,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to export agents' } });
    }
  });

  // Bulk import agents
  app.post('/import/bulk', async (request, reply) => {
    try {
      const { configs, createdBy, overwriteExisting = false } = request.body as {
        configs: (string | Record<string, unknown>)[];
        createdBy: string;
        overwriteExisting?: boolean;
      };

      const results: Array<{
        success: boolean;
        agent?: unknown;
        error?: string;
        name?: string;
      }> = [];

      for (const config of configs) {
        try {
          let parsedConfig: Record<string, unknown>;
          if (typeof config === 'string') {
            parsedConfig = importer.parse(config);
          } else {
            parsedConfig = config;
          }

          const params = importer.toCreateParams(parsedConfig as Parameters<typeof importer.toCreateParams>[0], { createdBy });
          const agent = await agentManager.create(params);

          results.push({
            success: true,
            agent,
            name: params.name,
          });
        } catch (error) {
          results.push({
            success: false,
            error: (error as Error).message,
            name: (config as Record<string, unknown>)?.metadata?.name as string || 'Unknown',
          });
        }
      }

      return reply.send({
        success: true,
        data: {
          imported: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          total: configs.length,
          results,
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({ success: false, error: { code: 'BULK_IMPORT_ERROR', message: (error as Error).message } });
    }
  });

  // =====================
  // Version History Endpoints
  // =====================

  // Get version history
  app.get<{ Params: { id: string } }>('/:id/versions', async (request, reply) => {
    try {
      const { id } = request.params;
      const history = await versionManager.getHistorySummary(id);
      return reply.send({ success: true, data: history });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch version history' } });
    }
  });

  // Get specific version
  app.get<{ Params: { id: string }; Params2: { version: string } }>('/:id/versions/:version', async (request, reply) => {
    try {
      const { id } = request.params;
      const version = parseInt(request.params.version);
      const versionData = await versionManager.getVersion(id, version);

      if (!versionData) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' } });
      }

      return reply.send({
        success: true,
        data: {
          ...versionData,
          config: JSON.parse(versionData.config),
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch version' } });
    }
  });

  // Compare versions
  app.get<{ Params: { id: string } }>('/:id/versions/compare', async (request, reply) => {
    try {
      const { id } = request.params;
      const { v1, v2 } = request.query as { v1: string; v2: string };

      if (!v1 || !v2) {
        return reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'v1 and v2 query params required' } });
      }

      const diff = await versionManager.compareVersions(id, parseInt(v1), parseInt(v2));
      return reply.send({ success: true, data: diff });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to compare versions' } });
    }
  });

  // Rollback to version
  app.post<{ Params: { id: string } }>('/:id/rollback', async (request, reply) => {
    try {
      const { id } = request.params;
      const { version } = request.body as { version: number };

      const success = await versionManager.rollback(id, version);
      if (!success) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Version not found' } });
      }

      const agent = await agentManager.get(id);
      return reply.send({ success: true, data: agent, rolledBackTo: version });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to rollback' } });
    }
  });

  // =====================
  // Template Endpoints
  // =====================

  // Get available templates
  app.get('/templates', async (request, reply) => {
    return reply.send({
      success: true,
      data: AGENT_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        author: t.author,
        config: {
          defaultModelId: t.config.defaultModelId,
          tools: t.config.tools,
          memoryConfig: t.config.memoryConfig,
        },
      })),
    });
  });

  // Create agent from template
  app.post('/templates/:templateId/instantiate', async (request, reply) => {
    try {
      const { templateId } = request.params;
      const { name, createdBy } = request.body as { name: string; createdBy: string };

      const template = AGENT_TEMPLATES.find(t => t.id === templateId);
      if (!template) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
      }

      const agent = await agentManager.createFromTemplate(template, name, createdBy);
      return reply.code(201).send({ success: true, data: agent });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to create agent from template' } });
    }
  });

  // Get persona presets
  app.get('/persona-presets', async (request, reply) => {
    return reply.send({
      success: true,
      data: Object.entries(PERSONA_PRESETS).map(([key, value]) => ({
        id: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        ...value,
      })),
    });
  });

  // Get memory strategies
  app.get('/memory-strategies', async (request, reply) => {
    return reply.send({
      success: true,
      data: Object.entries(MEMORY_STRATEGIES).map(([key, value]) => ({
        id: key,
        ...value,
      })),
    });
  });

  // Get available tools
  app.get('/tools', async (request, reply) => {
    const tools = toolRegistry.getAll();
    return reply.send({
      success: true,
      data: tools.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        parameters: t.parameters,
        requiresApproval: t.requiresApproval,
      })),
    });
  });

  // Save as template
  app.post<{ Params: { id: string } }>('/:id/save-as-template', async (request, reply) => {
    try {
      const { id } = request.params;
      const { name, description, category, tags } = request.body as {
        name: string;
        description?: string;
        category?: string[];
        tags?: string[];
      };

      const agent = await agentManager.get(id);
      if (!agent) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
      }

      const template = await agentManager.create({
        name,
        description: description || agent.description,
        persona: agent.persona,
        tools: agent.tools?.map(t => t.id) || [],
        defaultModelId: agent.defaultModelId,
        fallbackModelId: agent.fallbackModelId,
        memoryConfig: agent.memoryConfig,
        rateLimit: agent.rateLimit,
        tags: tags || agent.tags,
        createdBy: agent.createdBy,
      });

      return reply.code(201).send({ success: true, data: template });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to save template' } });
    }
  });
}