import { db } from '../../db/index.js';
import { pipelineExecutions, nodeExecutions, pipelines, agents, sessions, messages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { PipelineNode, PipelineEdge, ConditionConfig, DelayConfig } from '@agentic-os/types';

export interface ExecutionContext {
  executionId: string;
  pipelineId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  nodeOutputs: Map<string, unknown>;
  errors: string[];
}

export class PipelineExecutor {
  private isRunning: Map<string, boolean> = new Map();

  async execute(pipelineId: string, input: Record<string, unknown> = {}, triggerType: 'manual' | 'scheduled' | 'api' | 'webhook' = 'manual'): Promise<string> {
    // Get pipeline
    const pipeline = await db.select().from(pipelines).where(eq(pipelines.id, pipelineId)).limit(1);
    if (!pipeline.length) {
      throw new Error('Pipeline not found');
    }

    const nodes = JSON.parse(pipeline[0].nodes as string) as PipelineNode[];
    const edges = JSON.parse(pipeline[0].edges as string) as PipelineEdge[];

    // Create execution record
    const executionId = nanoid();
    const now = new Date();

    await db.insert(pipelineExecutions).values({
      id: executionId,
      pipelineId,
      status: 'running',
      startedAt: now,
      triggerType,
      input: JSON.stringify(input),
      createdAt: now,
    });

    // Initialize context
    const context: ExecutionContext = {
      executionId,
      pipelineId,
      input,
      output: {},
      nodeOutputs: new Map(),
      errors: [],
    };

    this.isRunning.set(executionId, true);

    // Execute in background
    this.runPipeline(context, nodes, edges).catch(err => {
      console.error('Pipeline execution error:', err);
      this.updateExecution(executionId, 'failed', undefined, err.message);
    });

    return executionId;
  }

  private async runPipeline(context: ExecutionContext, nodes: PipelineNode[], edges: PipelineEdge[]): Promise<void> {
    try {
      // Find input node and start execution
      const inputNodes = nodes.filter(n => n.type === 'input');
      if (inputNodes.length === 0) {
        context.errors.push('No input node found');
        await this.updateExecution(context.executionId, 'failed', undefined, context.errors.join('; '));
        return;
      }

      // Topological sort for execution order
      const executionOrder = this.topologicalSort(nodes, edges);

      // Execute each node in order
      for (const nodeId of executionOrder) {
        if (!this.isRunning.get(context.executionId)) {
          await this.updateExecution(context.executionId, 'cancelled', context.nodeOutputs);
          return;
        }

        const node = nodes.find(n => n.id === nodeId);
        if (!node) continue;

        // Check if node has all required inputs
        const nodeEdges = edges.filter(e => e.targetId === nodeId);
        const missingInputs = nodeEdges.filter(e => !context.nodeOutputs.has(e.sourceId));

        if (missingInputs.length > 0 && node.type !== 'input') {
          context.errors.push(`Node ${nodeId} missing required inputs`);
          continue;
        }

        await this.executeNode(context, node, edges);
      }

      // Check for output node
      const outputNodes = nodes.filter(n => n.type === 'output');
      let finalOutput = context.nodeOutputs.get(outputNodes[0]?.id) || context.nodeOutputs.get(executionOrder[executionOrder.length - 1]);

      await this.updateExecution(context.executionId, 'completed', { output: finalOutput, nodeOutputs: Object.fromEntries(context.nodeOutputs) });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      context.errors.push(errorMessage);
      await this.updateExecution(context.executionId, 'failed', undefined, errorMessage);
    } finally {
      this.isRunning.delete(context.executionId);
    }
  }

  private async executeNode(context: ExecutionContext, node: PipelineNode, edges: PipelineEdge[]): Promise<void> {
    const startTime = Date.now();

    // Record node execution start
    await db.insert(nodeExecutions).values({
      id: nanoid(),
      executionId: context.executionId,
      nodeId: node.id,
      status: 'running',
      startedAt: new Date(),
      input: JSON.stringify(this.getNodeInput(node, context, edges)),
      createdAt: new Date(),
    });

    try {
      let output: unknown;

      switch (node.type) {
        case 'input':
          output = context.input;
          break;

        case 'output':
          const inputEdge = edges.find(e => e.targetId === node.id);
          output = inputEdge ? context.nodeOutputs.get(inputEdge.sourceId) : context.input;
          break;

        case 'agent':
          output = await this.executeAgentNode(node, context);
          break;

        case 'condition':
          output = await this.executeConditionNode(node, context, edges);
          break;

        case 'delay':
          output = await this.executeDelayNode(node, context);
          break;

        case 'merge':
          output = await this.executeMergeNode(node, context, edges);
          break;

        case 'split':
          output = await this.executeSplitNode(node, context, edges);
          break;

        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      context.nodeOutputs.set(node.id, output);

      // Record success
      await db.insert(nodeExecutions).values({
        id: nanoid(),
        executionId: context.executionId,
        nodeId: node.id,
        status: 'success',
        startedAt: new Date(startTime),
        endedAt: new Date(),
        input: JSON.stringify(this.getNodeInput(node, context, edges)),
        output: JSON.stringify(output),
        latencyMs: Date.now() - startTime,
        createdAt: new Date(),
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      context.errors.push(`${node.id}: ${errorMessage}`);

      await db.insert(nodeExecutions).values({
        id: nanoid(),
        executionId: context.executionId,
        nodeId: node.id,
        status: 'error',
        startedAt: new Date(startTime),
        endedAt: new Date(),
        input: JSON.stringify(this.getNodeInput(node, context, edges)),
        output: undefined,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
        createdAt: new Date(),
      });
    }
  }

  private async executeAgentNode(node: PipelineNode, context: ExecutionContext): Promise<unknown> {
    const config = node.config as { agentId?: string; modelId?: string; systemPrompt?: string };
    const { agentId } = config;

    if (!agentId) {
      throw new Error('Agent node missing agentId');
    }

    // Get input from connected nodes
    const inputEdge = context.nodeOutputs.get(node.inputs[0] || '');
    const inputData = typeof inputEdge === 'string' ? inputEdge : JSON.stringify(inputEdge);

    // Create session and run agent
    const sessionId = nanoid();
    const modelId = config.modelId || 'default';

    await db.insert(sessions).values({
      id: sessionId,
      agentId,
      userId: 'pipeline',
      modelId,
      status: 'active',
      startedAt: new Date(),
      metadata: JSON.stringify({ pipelineId: context.pipelineId, executionId: context.executionId }),
    });

    // Add user message
    await db.insert(messages).values({
      id: nanoid(),
      sessionId,
      role: 'user',
      content: typeof inputData === 'string' ? inputData : JSON.stringify(inputData),
      modelId,
      latencyMs: 0,
      costUsd: 0,
      createdAt: new Date(),
    });

    // In a real implementation, this would call the LLM provider
    // For now, return a placeholder
    return {
      sessionId,
      response: `Agent ${agentId} processed input`,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeConditionNode(node: PipelineNode, context: ExecutionContext, edges: PipelineEdge[]): Promise<unknown> {
    const config = node.config as ConditionConfig;
    const inputData = this.getNodeInput(node, context, edges);

    // Get the field value from input
    const fieldValue = this.getNestedValue(inputData, config.field);
    const { operator, value } = config;

    let result = false;

    switch (operator) {
      case 'eq':
        result = fieldValue === value;
        break;
      case 'neq':
        result = fieldValue !== value;
        break;
      case 'gt':
        result = (fieldValue as number) > (value as number);
        break;
      case 'lt':
        result = (fieldValue as number) < (value as number);
        break;
      case 'gte':
        result = (fieldValue as number) >= (value as number);
        break;
      case 'lte':
        result = (fieldValue as number) <= (value as number);
        break;
      case 'contains':
        result = String(fieldValue).includes(String(value));
        break;
      case 'not_contains':
        result = !String(fieldValue).includes(String(value));
        break;
    }

    return { conditionMet: result, value: fieldValue };
  }

  private async executeDelayNode(node: PipelineNode, _context: ExecutionContext): Promise<unknown> {
    const config = node.config as DelayConfig;
    const delayMs = config.durationMs || 1000;

    await new Promise(resolve => setTimeout(resolve, delayMs));

    return { delayed: true, durationMs: delayMs };
  }

  private async executeMergeNode(node: PipelineNode, context: ExecutionContext, edges: PipelineEdge[]): Promise<unknown> {
    const config = node.config as { strategy?: 'all' | 'first' | 'fail_fast' };
    const strategy = config.strategy || 'all';

    const inputs = node.inputs.map(inputId => context.nodeOutputs.get(inputId));

    if (strategy === 'first') {
      return inputs.find(i => i !== undefined) || null;
    }

    if (strategy === 'fail_fast') {
      const failed = inputs.find(i => i && (i as Record<string, unknown>).error);
      if (failed) return failed;
    }

    return { results: inputs, count: inputs.length };
  }

  private async executeSplitNode(node: PipelineNode, context: ExecutionContext, edges: PipelineEdge[]): Promise<unknown> {
    const config = node.config as { branches?: number };
    const branches = config.branches || 2;

    const input = this.getNodeInput(node, context, edges);

    // Return input data to be sent to multiple branches
    return {
      split: true,
      branches,
      data: input,
    };
  }

  private getNodeInput(node: PipelineNode, context: ExecutionContext, edges: PipelineEdge[]): unknown {
    if (node.inputs.length === 0) {
      return context.input;
    }

    // Get output from first connected input
    const inputNodeId = node.inputs[0];
    return context.nodeOutputs.get(inputNodeId) || context.input;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    const keys = path.split('.');
    let value: unknown = obj;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private topologicalSort(nodes: PipelineNode[], edges: PipelineEdge[]): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    // Build graph
    for (const edge of edges) {
      adjacency.get(edge.sourceId)?.push(edge.targetId);
      inDegree.set(edge.targetId, (inDegree.get(edge.targetId) || 0) + 1);
    }

    // Find nodes with no incoming edges (starting nodes)
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const result: string[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      for (const neighbor of adjacency.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If we didn't visit all nodes, there's a cycle
    if (result.length !== nodes.length) {
      throw new Error('Pipeline contains a cycle');
    }

    return result;
  }

  private async updateExecution(
    executionId: string,
    status: 'running' | 'completed' | 'failed' | 'cancelled',
    output?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    await db.update(pipelineExecutions).set({
      status,
      endedAt: new Date(),
      output: output ? JSON.stringify(output) : undefined,
      error,
    }).where(eq(pipelineExecutions.id, executionId)).run();
  }

  cancel(executionId: string): boolean {
    if (this.isRunning.has(executionId)) {
      this.isRunning.set(executionId, false);
      return true;
    }
    return false;
  }
}

// Singleton
let executor: PipelineExecutor | null = null;

export function getPipelineExecutor(): PipelineExecutor {
  if (!executor) {
    executor = new PipelineExecutor();
  }
  return executor;
}