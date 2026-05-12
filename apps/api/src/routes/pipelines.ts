import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { pipelines, pipelineExecutions, nodeExecutions, agents } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { PipelineNode, PipelineEdge } from '@agentic-os/types';

interface CreatePipelineBody {
  name: string;
  description?: string;
  nodes?: PipelineNode[];
  edges?: PipelineEdge[];
}

interface UpdatePipelineBody extends CreatePipelineBody {
  status?: 'draft' | 'active' | 'paused';
}

interface ExecutePipelineBody {
  input?: Record<string, unknown>;
  triggerType?: 'manual' | 'scheduled' | 'api' | 'webhook';
}

export async function pipelineRoutes(fastify: FastifyInstance) {
  // List all pipelines
  fastify.get('/pipelines', async (request, reply) => {
    const allPipelines = await db.select().from(pipelines).orderBy(desc(pipelines.createdAt));

    return {
      success: true,
      data: allPipelines,
    };
  });

  // Get single pipeline
  fastify.get<{ Params: { id: string } }>('/pipelines/:id', async (request, reply) => {
    const { id } = request.params;

    const pipeline = await db.select().from(pipelines).where(eq(pipelines.id, id)).limit(1);

    if (!pipeline.length) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pipeline not found' },
      });
    }

    return {
      success: true,
      data: pipeline[0],
    };
  });

  // Create pipeline
  fastify.post<{ Body: CreatePipelineBody }>('/pipelines', async (request, reply) => {
    const { name, description, nodes = [], edges = [] } = request.body;

    if (!name) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Pipeline name is required' },
      });
    }

    const now = new Date();
    const pipeline = {
      id: nanoid(),
      name,
      description: description || null,
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
      createdBy: 'system',
      status: 'draft' as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(pipelines).values(pipeline);

    return reply.status(201).send({
      success: true,
      data: {
        ...pipeline,
        nodes,
        edges,
      },
    });
  });

  // Update pipeline
  fastify.put<{ Params: { id: string }; Body: UpdatePipelineBody }>(
    '/pipelines/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { name, description, nodes, edges, status } = request.body;

      const existing = await db.select().from(pipelines).where(eq(pipelines.id, id)).limit(1);

      if (!existing.length) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Pipeline not found' },
        });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (nodes !== undefined) updates.nodes = JSON.stringify(nodes);
      if (edges !== undefined) updates.edges = JSON.stringify(edges);
      if (status !== undefined) updates.status = status;

      await db.update(pipelines).set(updates).where(eq(pipelines.id, id)).run();

      const updated = await db.select().from(pipelines).where(eq(pipelines.id, id)).limit(1);

      return {
        success: true,
        data: {
          ...updated[0],
          nodes: JSON.parse(updated[0].nodes as string),
          edges: JSON.parse(updated[0].edges as string),
        },
      };
    }
  );

  // Delete pipeline
  fastify.delete<{ Params: { id: string } }>('/pipelines/:id', async (request, reply) => {
    const { id } = request.params;

    const existing = await db.select().from(pipelines).where(eq(pipelines.id, id)).limit(1);

    if (!existing.length) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pipeline not found' },
      });
    }

    await db.delete(pipelines).where(eq(pipelines.id, id)).run();

    return {
      success: true,
      data: { deleted: true },
    };
  });

  // Validate pipeline
  fastify.post<{ Params: { id: string } }>('/pipelines/:id/validate', async (request, reply) => {
    const { id } = request.params;

    const pipeline = await db.select().from(pipelines).where(eq(pipelines.id, id)).limit(1);

    if (!pipeline.length) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pipeline not found' },
      });
    }

    const nodes = JSON.parse(pipeline[0].nodes as string) as PipelineNode[];
    const edges = JSON.parse(pipeline[0].edges as string) as PipelineEdge[];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoing = edges.filter(e => e.sourceId === nodeId);
      for (const edge of outgoing) {
        if (hasCycle(edge.targetId)) return true;
      }

      recursionStack.delete(nodeId);
      return false;
    };

    if (nodes.length > 0 && hasCycle(nodes[0].id)) {
      errors.push('Pipeline contains a cycle');
    }

    // Check for input nodes
    const inputNodes = nodes.filter(n => n.type === 'input');
    if (inputNodes.length === 0 && nodes.length > 0) {
      warnings.push('No input node found. Pipeline may not receive data.');
    }

    // Check for output nodes
    const outputNodes = nodes.filter(n => n.type === 'output');
    if (outputNodes.length === 0 && nodes.length > 0) {
      warnings.push('No output node found. Pipeline output will be discarded.');
    }

    // Check for orphaned nodes
    const connectedNodes = new Set<string>();
    edges.forEach(e => {
      connectedNodes.add(e.sourceId);
      connectedNodes.add(e.targetId);
    });

    const orphanedNodes = nodes.filter(n => n.type !== 'input' && n.type !== 'output' && !connectedNodes.has(n.id));
    if (orphanedNodes.length > 0) {
      warnings.push(`${orphanedNodes.length} node(s) not connected to the pipeline`);
    }

    // Check for dangling edges
    const nodeIds = new Set(nodes.map(n => n.id));
    const danglingEdges = edges.filter(e => !nodeIds.has(e.sourceId) || !nodeIds.has(e.targetId));
    if (danglingEdges.length > 0) {
      errors.push(`${danglingEdges.length} edge(s) reference non-existent nodes`);
    }

    const isValid = errors.length === 0;

    return {
      success: true,
      data: {
        isValid,
        errors,
        warnings,
      },
    };
  });

  // Execute pipeline
  fastify.post<{ Params: { id: string }; Body: ExecutePipelineBody }>(
    '/pipelines/:id/execute',
    async (request, reply) => {
      const { id } = request.params;
      const { input = {}, triggerType = 'manual' } = request.body;

      const pipeline = await db.select().from(pipelines).where(eq(pipelines.id, id)).limit(1);

      if (!pipeline.length) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Pipeline not found' },
        });
      }

      if (pipeline[0].status !== 'active') {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_STATE', message: 'Pipeline must be active to execute' },
        });
      }

      const nodes = JSON.parse(pipeline[0].nodes as string) as PipelineNode[];
      const edges = JSON.parse(pipeline[0].edges as string) as PipelineEdge[];

      // Create execution record
      const now = new Date();
      const execution = {
        id: nanoid(),
        pipelineId: id,
        status: 'running' as const,
        startedAt: now,
        triggerType: triggerType as 'manual' | 'scheduled' | 'api' | 'webhook',
        input: JSON.stringify(input),
        createdAt: now,
      };

      await db.insert(pipelineExecutions).values(execution);

      return reply.status(201).send({
        success: true,
        data: {
          ...execution,
          input,
        },
      });
    }
  );

  // List executions for pipeline
  fastify.get<{ Params: { id: string } }>('/pipelines/:id/executions', async (request, reply) => {
    const { id } = request.params;

    const executions = await db
      .select()
      .from(pipelineExecutions)
      .where(eq(pipelineExecutions.pipelineId, id))
      .orderBy(desc(pipelineExecutions.startedAt));

    return {
      success: true,
      data: executions.map(e => ({
        ...e,
        input: e.input ? JSON.parse(e.input as string) : {},
        output: e.output ? JSON.parse(e.output as string) : undefined,
      })),
    };
  });

  // Get execution details with node executions
  fastify.get<{ Params: { id: string } }>(
    '/pipelines/executions/:id',
    async (request, reply) => {
      const { id } = request.params;

      const execution = await db
        .select()
        .from(pipelineExecutions)
        .where(eq(pipelineExecutions.id, id))
        .limit(1);

      if (!execution.length) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Execution not found' },
        });
      }

      const nodes = await db
        .select()
        .from(nodeExecutions)
        .where(eq(nodeExecutions.executionId, id))
        .orderBy(nodeExecutions.startedAt);

      return {
        success: true,
        data: {
          ...execution[0],
          input: execution[0].input ? JSON.parse(execution[0].input as string) : {},
          output: execution[0].output ? JSON.parse(execution[0].output as string) : undefined,
          nodeExecutions: nodes.map(n => ({
            ...n,
            input: n.input ? JSON.parse(n.input as string) : undefined,
            output: n.output ? JSON.parse(n.output as string) : undefined,
          })),
        },
      };
    }
  );

  // Clone pipeline
  fastify.post<{ Params: { id: string } }>('/pipelines/:id/clone', async (request, reply) => {
    const { id } = request.params;

    const pipeline = await db.select().from(pipelines).where(eq(pipelines.id, id)).limit(1);

    if (!pipeline.length) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pipeline not found' },
      });
    }

    const now = new Date();
    const cloned = {
      id: nanoid(),
      name: `${pipeline[0].name} (Copy)`,
      description: pipeline[0].description,
      nodes: pipeline[0].nodes,
      edges: pipeline[0].edges,
      createdBy: 'system',
      status: 'draft' as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(pipelines).values(cloned);

    return reply.status(201).send({
      success: true,
      data: {
        ...cloned,
        nodes: JSON.parse(cloned.nodes as string),
        edges: JSON.parse(cloned.edges as string),
      },
    });
  });

  // Get available agents for pipeline nodes
  fastify.get('/pipelines/agents', async (request, reply) => {
    const allAgents = await db.select().from(agents).orderBy(agents.name);

    return {
      success: true,
      data: allAgents,
    };
  });

  // Pipeline templates
  fastify.get('/pipelines/templates', async (request, reply) => {
    // Pre-built templates
    const templates = [
      {
        id: 'template-sequential',
        name: 'Sequential Agents',
        description: 'Run multiple agents one after another, passing output to next',
        nodes: [
          { id: 'input-1', type: 'input', position: { x: 100, y: 200 }, config: {}, inputs: [], outputs: [] },
          { id: 'agent-1', type: 'agent', position: { x: 300, y: 200 }, config: { agentId: '' }, inputs: ['input-1'], outputs: [] },
          { id: 'output-1', type: 'output', position: { x: 500, y: 200 }, config: {}, inputs: ['agent-1'], outputs: [] },
        ],
        edges: [
          { id: 'e1', sourceId: 'input-1', targetId: 'agent-1', type: 'data' },
          { id: 'e2', sourceId: 'agent-1', targetId: 'output-1', type: 'data' },
        ],
      },
      {
        id: 'template-parallel',
        name: 'Parallel Processing',
        description: 'Split input to multiple agents running in parallel',
        nodes: [
          { id: 'input-1', type: 'input', position: { x: 100, y: 200 }, config: {}, inputs: [], outputs: [] },
          { id: 'split-1', type: 'split', position: { x: 250, y: 200 }, config: { branches: 2 }, inputs: ['input-1'], outputs: [] },
          { id: 'agent-1', type: 'agent', position: { x: 400, y: 100 }, config: { agentId: '' }, inputs: ['split-1'], outputs: [] },
          { id: 'agent-2', type: 'agent', position: { x: 400, y: 300 }, config: { agentId: '' }, inputs: ['split-1'], outputs: [] },
          { id: 'merge-1', type: 'merge', position: { x: 550, y: 200 }, config: { strategy: 'all' }, inputs: ['agent-1', 'agent-2'], outputs: [] },
          { id: 'output-1', type: 'output', position: { x: 700, y: 200 }, config: {}, inputs: ['merge-1'], outputs: [] },
        ],
        edges: [
          { id: 'e1', sourceId: 'input-1', targetId: 'split-1', type: 'data' },
          { id: 'e2', sourceId: 'split-1', targetId: 'agent-1', type: 'data' },
          { id: 'e3', sourceId: 'split-1', targetId: 'agent-2', type: 'data' },
          { id: 'e4', sourceId: 'agent-1', targetId: 'merge-1', type: 'data' },
          { id: 'e5', sourceId: 'agent-2', targetId: 'merge-1', type: 'data' },
          { id: 'e6', sourceId: 'merge-1', targetId: 'output-1', type: 'data' },
        ],
      },
      {
        id: 'template-conditional',
        name: 'Conditional Branching',
        description: 'Route to different agents based on conditions',
        nodes: [
          { id: 'input-1', type: 'input', position: { x: 100, y: 200 }, config: {}, inputs: [], outputs: [] },
          { id: 'condition-1', type: 'condition', position: { x: 300, y: 200 }, config: { field: '', operator: 'eq', value: '' }, inputs: ['input-1'], outputs: [] },
          { id: 'agent-1', type: 'agent', position: { x: 500, y: 100 }, config: { agentId: '' }, inputs: ['condition-1'], outputs: [] },
          { id: 'agent-2', type: 'agent', position: { x: 500, y: 300 }, config: { agentId: '' }, inputs: ['condition-1'], outputs: [] },
          { id: 'output-1', type: 'output', position: { x: 700, y: 200 }, config: {}, inputs: ['agent-1', 'agent-2'], outputs: [] },
        ],
        edges: [
          { id: 'e1', sourceId: 'input-1', targetId: 'condition-1', type: 'data' },
          { id: 'e2', sourceId: 'condition-1', targetId: 'agent-1', type: 'control' },
          { id: 'e3', sourceId: 'condition-1', targetId: 'agent-2', type: 'control' },
          { id: 'e4', sourceId: 'agent-1', targetId: 'output-1', type: 'data' },
          { id: 'e5', sourceId: 'agent-2', targetId: 'output-1', type: 'data' },
        ],
      },
    ];

    return {
      success: true,
      data: templates,
    };
  });
}
