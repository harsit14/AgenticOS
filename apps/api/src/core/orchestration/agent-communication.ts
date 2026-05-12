import { nanoid } from 'nanoid';
import type { PipelineNode, PipelineEdge } from '@agentic-os/types';

export type MessageType = 'task' | 'result' | 'error' | 'context_update' | 'heartbeat';

export interface AgentMessage {
  id: string;
  from: string;
  to: string | 'broadcast';
  content: unknown;
  type: MessageType;
  correlationId: string;
  timestamp: number;
  metadata?: {
    sessionId?: string;
    pipelineId?: string;
    replyTo?: string;
  };
}

export interface SharedContext {
  pipelineId: string;
  data: Record<string, unknown>;
  vectorStore?: VectorEntry[];
  artifacts: Artifact[];
  locks: Map<string, boolean>;
}

export interface VectorEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface Artifact {
  id: string;
  name: string;
  type: 'file' | 'data' | 'model';
  path?: string;
  data?: unknown;
  size?: number;
  createdBy: string;
  createdAt: number;
}

// Message bus for agent communication
export class AgentMessageBus {
  private subscribers: Map<string, Set<(message: AgentMessage) => void>> = new Map();
  private messageHistory: AgentMessage[] = [];
  private maxHistory = 1000;

  async publish(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<AgentMessage> {
    const fullMessage: AgentMessage = {
      ...message,
      id: nanoid(),
      timestamp: Date.now(),
    };

    // Store in history
    this.messageHistory.push(fullMessage);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }

    // Deliver to subscribers
    const targetSubscribers = new Set<string>();
    targetSubscribers.add(fullMessage.to);
    targetSubscribers.add('broadcast');

    for (const target of targetSubscribers) {
      const callbacks = this.subscribers.get(target);
      if (callbacks) {
        callbacks.forEach(cb => cb(fullMessage));
      }
    }

    return fullMessage;
  }

  subscribe(agentId: string, callback: (message: AgentMessage) => void): () => void {
    if (!this.subscribers.has(agentId)) {
      this.subscribers.set(agentId, new Set());
    }
    this.subscribers.get(agentId)!.add(callback);

    return () => {
      this.subscribers.get(agentId)?.delete(callback);
    };
  }

  getHistory(agentId?: string, limit = 100): AgentMessage[] {
    let history = this.messageHistory;
    if (agentId) {
      history = history.filter(m => m.from === agentId || m.to === agentId || m.to === 'broadcast');
    }
    return history.slice(-limit);
  }

  clearHistory(): void {
    this.messageHistory = [];
  }
}

// Shared context store per pipeline
export class SharedContextStore {
  private contexts: Map<string, SharedContext> = new Map();

  create(pipelineId: string): SharedContext {
    const context: SharedContext = {
      pipelineId,
      data: {},
      artifacts: [],
      locks: new Map(),
    };
    this.contexts.set(pipelineId, context);
    return context;
  }

  get(pipelineId: string): SharedContext | undefined {
    return this.contexts.get(pipelineId);
  }

  set(pipelineId: string, key: string, value: unknown): void {
    const ctx = this.contexts.get(pipelineId);
    if (ctx) {
      ctx.data[key] = value;
    }
  }

  getValue<T>(pipelineId: string, key: string): T | undefined {
    return this.contexts.get(pipelineId)?.data[key] as T | undefined;
  }

  delete(pipelineId: string, key: string): void {
    const ctx = this.contexts.get(pipelineId);
    if (ctx) {
      delete ctx.data[key];
    }
  }

  addArtifact(pipelineId: string, artifact: Omit<Artifact, 'id' | 'createdAt'>): Artifact {
    const ctx = this.contexts.get(pipelineId);
    if (!ctx) throw new Error('Context not found');

    const fullArtifact: Artifact = {
      ...artifact,
      id: nanoid(),
      createdAt: Date.now(),
    };
    ctx.artifacts.push(fullArtifact);
    return fullArtifact;
  }

  getArtifacts(pipelineId: string): Artifact[] {
    return this.contexts.get(pipelineId)?.artifacts || [];
  }

  acquireLock(pipelineId: string, resourceId: string): boolean {
    const ctx = this.contexts.get(pipelineId);
    if (!ctx) return false;

    if (ctx.locks.get(resourceId)) {
      return false;
    }
    ctx.locks.set(resourceId, true);
    return true;
  }

  releaseLock(pipelineId: string, resourceId: string): void {
    const ctx = this.contexts.get(pipelineId);
    if (ctx) {
      ctx.locks.delete(resourceId);
    }
  }

  destroy(pipelineId: string): void {
    this.contexts.delete(pipelineId);
  }
}

// Execution patterns
export type ExecutionPattern = 'sequential' | 'parallel' | 'conditional' | 'loop';

export interface ExecutionPlan {
  pattern: ExecutionPattern;
  nodes: string[];
  config: {
    maxIterations?: number;
    condition?: (ctx: SharedContext) => boolean;
    continueOnError?: boolean;
    timeoutMs?: number;
  };
}

// Pattern executors
export class SequentialExecutor {
  constructor(
    private messageBus: AgentMessageBus,
    private contextStore: SharedContextStore
  ) {}

  async execute(
    pipelineId: string,
    nodes: PipelineNode[],
    edges: PipelineEdge[],
    nodeExecutor: (nodeId: string, input: unknown) => Promise<unknown>,
    options: { continueOnError?: boolean; timeoutMs?: number } = {}
  ): Promise<unknown> {
    const sortedNodes = this.topologicalSort(nodes, edges);
    let lastOutput: unknown;

    for (const nodeId of sortedNodes) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node || node.type === 'input') {
        lastOutput = this.contextStore.getValue(pipelineId, 'input');
        continue;
      }

      lastOutput = await this.executeWithTimeout(
        () => nodeExecutor(nodeId, lastOutput),
        options.timeoutMs
      );

      this.contextStore.set(pipelineId, `node.${nodeId}`, lastOutput);
    }

    return lastOutput;
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    if (!timeoutMs) return fn();

    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
      ),
    ]);
  }

  private topologicalSort(nodes: PipelineNode[], edges: PipelineEdge[]): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of edges) {
      adjacency.get(edge.sourceId)?.push(edge.targetId);
      inDegree.set(edge.targetId, (inDegree.get(edge.targetId) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) queue.push(nodeId);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);
      for (const neighbor of adjacency.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return result;
  }
}

export class ParallelExecutor {
  constructor(
    private messageBus: AgentMessageBus,
    private contextStore: SharedContextStore
  ) {}

  async execute(
    pipelineId: string,
    nodeIds: string[],
    nodeExecutor: (nodeId: string, input: unknown) => Promise<unknown>,
    options: { input?: unknown; timeoutMs?: number; failFast?: boolean } = {}
  ): Promise<unknown[]> {
    const { input, timeoutMs, failFast = false } = options;
    const results: (unknown | Error)[] = new Array(nodeIds.length);
    let firstError: Error | null = null;

    const executeNode = async (index: number, nodeId: string) => {
      if (failFast && firstError) {
        results[index] = new Error('Skipped due to fail-fast');
        return;
      }

      try {
        const result = await this.executeWithTimeout(
          () => nodeExecutor(nodeId, input),
          timeoutMs
        );
        results[index] = result;
      } catch (error) {
        results[index] = error instanceof Error ? error : new Error(String(error));
        if (failFast && !firstError) {
          firstError = results[index] as Error;
        }
      }
    };

    await Promise.all(nodeIds.map((nodeId, i) => executeNode(i, nodeId)));

    return results;
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    if (!timeoutMs) return fn();

    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
      ),
    ]);
  }
}

export class ConditionalExecutor {
  constructor(
    private messageBus: AgentMessageBus,
    private contextStore: SharedContextStore
  ) {}

  async execute(
    pipelineId: string,
    condition: (ctx: SharedContext) => boolean,
    trueBranch: () => Promise<unknown>,
    falseBranch: () => Promise<unknown>
  ): Promise<{ branch: 'true' | 'false'; result: unknown }> {
    const ctx = this.contextStore.get(pipelineId);
    if (!ctx) throw new Error('Context not found');

    const conditionMet = condition(ctx);

    if (conditionMet) {
      const result = await trueBranch();
      return { branch: 'true', result };
    } else {
      const result = await falseBranch();
      return { branch: 'false', result };
    }
  }
}

export class LoopExecutor {
  private iterationCount: Map<string, number> = new Map();

  constructor(
    private messageBus: AgentMessageBus,
    private contextStore: SharedContextStore
  ) {}

  async execute(
    pipelineId: string,
    body: () => Promise<unknown>,
    condition: (ctx: SharedContext) => boolean,
    maxIterations: number = 100
  ): Promise<{ iterations: number; result: unknown }> {
    this.iterationCount.set(pipelineId, 0);
    let iteration = 0;
    let lastResult: unknown;

    const ctx = this.contextStore.get(pipelineId);
    if (!ctx) throw new Error('Context not found');

    while (iteration < maxIterations && condition(ctx)) {
      lastResult = await body();
      this.contextStore.set(pipelineId, `loop.result`, lastResult);

      iteration++;
      this.iterationCount.set(pipelineId, iteration);
    }

    if (iteration >= maxIterations) {
      this.messageBus.publish({
        from: 'loop-executor',
        to: 'broadcast',
        content: { warning: `Loop reached max iterations (${maxIterations})`, pipelineId },
        type: 'context_update',
        correlationId: nanoid(),
      });
    }

    return { iterations: iteration, result: lastResult };
  }

  getIterations(pipelineId: string): number {
    return this.iterationCount.get(pipelineId) || 0;
  }
}

// Error propagation handler
export class ErrorHandler {
  private errorLog: Map<string, Error[]> = new Map();

  recordError(pipelineId: string, nodeId: string, error: Error): void {
    if (!this.errorLog.has(pipelineId)) {
      this.errorLog.set(pipelineId, []);
    }
    this.errorLog.get(pipelineId)!.push({
      ...error,
      message: `[${nodeId}] ${error.message}`,
    });
  }

  getErrors(pipelineId: string): Error[] {
    return this.errorLog.get(pipelineId) || [];
  }

  hasErrors(pipelineId: string): boolean {
    return (this.errorLog.get(pipelineId)?.length || 0) > 0;
  }

  clearErrors(pipelineId: string): void {
    this.errorLog.delete(pipelineId);
  }

  propagate(error: Error, context: Record<string, unknown>): Error {
    return new Error(
      `${error.message}\nContext: ${JSON.stringify(context, null, 2)}`
    );
  }
}

// Singleton instances
let messageBus: AgentMessageBus | null = null;
let contextStore: SharedContextStore | null = null;
let errorHandler: ErrorHandler | null = null;

export function getMessageBus(): AgentMessageBus {
  if (!messageBus) {
    messageBus = new AgentMessageBus();
  }
  return messageBus;
}

export function getContextStore(): SharedContextStore {
  if (!contextStore) {
    contextStore = new SharedContextStore();
  }
  return contextStore;
}

export function getErrorHandler(): ErrorHandler {
  if (!errorHandler) {
    errorHandler = new ErrorHandler();
  }
  return errorHandler;
}

// Utility: Create standard agent message
export function createAgentMessage(
  from: string,
  to: string | 'broadcast',
  type: MessageType,
  content: unknown,
  correlationId?: string
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    from,
    to,
    type,
    content,
    correlationId: correlationId || nanoid(),
  };
}