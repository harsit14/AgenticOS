import type { Agent, ChatMessage } from '@agentic-os/types';
import { db } from '../../db/index.js';
import { agents, messages } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getToolRegistry } from './tool-registry.js';
import { PERSONA_PRESETS, MEMORY_STRATEGIES, validateAgent, type AgentTemplate } from './types.js';

export interface CreateAgentParams {
  name: string;
  description?: string;
  persona?: Partial<{
    tone: 'professional' | 'casual' | 'technical' | 'creative';
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    knowledgeBases: string[];
  }>;
  tools?: string[];
  defaultModelId?: string;
  fallbackModelId?: string;
  memoryConfig?: { strategy: 'sliding_window' | 'summary' | 'full'; maxMessages: number };
  rateLimit?: number;
  tags?: string[];
  createdBy: string;
}

export interface UpdateAgentParams {
  name?: string;
  description?: string;
  persona?: Partial<Agent['persona']>;
  tools?: string[];
  defaultModelId?: string;
  fallbackModelId?: string;
  memoryConfig?: Agent['memoryConfig'];
  rateLimit?: number;
  tags?: string[];
}

// Agent Manager - handles CRUD operations for agents
export class AgentManager {
  async create(params: CreateAgentParams): Promise<Agent> {
    const validation = validateAgent(params as Partial<Agent>);
    if (!validation.valid) {
      throw new Error(`Invalid agent: ${validation.errors.join(', ')}`);
    }

    // Get tool definitions for the specified tools
    const registry = getToolRegistry();
    const toolDefs = (params.tools || []).map(toolId => {
      const tool = registry.get(toolId);
      return tool ? { id: tool.id, name: tool.name, description: tool.description, parameters: tool.parameters, requiresApproval: tool.requiresApproval } : null;
    }).filter(Boolean);

    // Apply persona preset if specified
    let persona = params.persona || {};
    if (persona.tone && PERSONA_PRESETS[persona.tone] && !persona.systemPrompt) {
      persona = { ...PERSONA_PRESETS[persona.tone], ...persona };
    }

    const now = new Date();
    const agent: typeof agents.$inferInsert = {
      id: nanoid(),
      name: params.name,
      description: params.description || '',
      persona: persona as Agent['persona'],
      tools: toolDefs as Agent['tools'],
      defaultModelId: params.defaultModelId || 'claude-3-5-sonnet',
      fallbackModelId: params.fallbackModelId,
      memoryConfig: params.memoryConfig || { strategy: 'sliding_window', maxMessages: 50 },
      rateLimit: params.rateLimit || 60,
      createdBy: params.createdBy,
      isTemplate: false,
      tags: params.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(agents).values(agent).run();
    return agent as Agent;
  }

  async update(id: string, params: UpdateAgentParams): Promise<Agent | null> {
    const existing = await db.select().from(agents).where(eq(agents.id, id)).get();
    if (!existing) return null;

    const validation = validateAgent({ ...existing, ...params } as Partial<Agent>);
    if (!validation.valid) {
      throw new Error(`Invalid agent: ${validation.errors.join(', ')}`);
    }

    // Get updated tool definitions if tools changed
    let toolDefs = existing.tools;
    if (params.tools) {
      const registry = getToolRegistry();
      toolDefs = params.tools.map(toolId => {
        const tool = registry.get(toolId);
        return tool ? { id: tool.id, name: tool.name, description: tool.description, parameters: tool.parameters, requiresApproval: tool.requiresApproval } : null;
      }).filter(Boolean) as Agent['tools'];
    }

    const updated = {
      ...existing,
      ...params,
      tools: toolDefs,
      updatedAt: new Date(),
    };

    await db.update(agents).set(updated).where(eq(agents.id, id)).run();
    return updated as Agent;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await db.select().from(agents).where(eq(agents.id, id)).get();
    if (!existing) return false;

    await db.delete(agents).where(eq(agents.id, id)).run();
    return true;
  }

  async get(id: string): Promise<Agent | null> {
    return db.select().from(agents).where(eq(agents.id, id)).get() as Promise<Agent | null>;
  }

  async list(filters?: { createdBy?: string; tags?: string[]; isTemplate?: boolean }): Promise<Agent[]> {
    let result = await db.select().from(agents).all();

    if (filters?.createdBy) {
      result = result.filter(a => a.createdBy === filters.createdBy);
    }
    if (filters?.tags?.length) {
      result = result.filter(a => a.tags?.some(t => filters.tags?.includes(t)));
    }
    if (filters?.isTemplate !== undefined) {
      result = result.filter(a => a.isTemplate === filters.isTemplate);
    }

    return result as Agent[];
  }

  async clone(id: string, newName: string, createdBy: string): Promise<Agent | null> {
    const original = await this.get(id);
    if (!original) return null;

    const cloned = await this.create({
      name: newName,
      description: original.description,
      persona: original.persona,
      tools: original.tools?.map(t => t.id) || [],
      defaultModelId: original.defaultModelId,
      fallbackModelId: original.fallbackModelId,
      memoryConfig: original.memoryConfig,
      rateLimit: original.rateLimit,
      tags: original.tags,
      createdBy,
    });

    return cloned;
  }

  async createFromTemplate(template: AgentTemplate, name: string, createdBy: string): Promise<Agent> {
    return this.create({
      name,
      description: template.description,
      persona: template.config.persona,
      tools: template.config.tools,
      defaultModelId: template.config.defaultModelId,
      memoryConfig: template.config.memoryConfig,
      createdBy,
    });
  }

  // Get available tools for an agent
  getAgentTools(agent: Agent): Array<{ id: string; name: string; description: string; requiresApproval: boolean }> {
    return (agent.tools || []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      requiresApproval: t.requiresApproval || false,
    }));
  }

  // Get agent capabilities
  getAgentCapabilities(agent: Agent): {
    supportsStreaming: boolean;
    supportsVision: boolean;
    supportsFunctionCalling: boolean;
    memoryStrategy: string;
    contextWindowEstimate: number;
  } {
    const registry = getToolRegistry();
    const hasFunctionCallingTool = agent.tools?.some(t => t.id === 'code_interpreter' || t.id === 'http_request');

    return {
      supportsStreaming: true,
      supportsVision: false, // Would check model capabilities
      supportsFunctionCalling: !!hasFunctionCallingTool,
      memoryStrategy: agent.memoryConfig?.strategy || 'sliding_window',
      contextWindowEstimate: agent.memoryConfig?.maxMessages || 50,
    };
  }
}

// Memory Manager - handles message context for agents
export class MemoryManager {
  private agentManager: AgentManager;

  constructor(agentManager: AgentManager) {
    this.agentManager = agentManager;
  }

  // Get messages for context, applying memory strategy
  async getContextMessages(sessionId: string, agentId: string): Promise<ChatMessage[]> {
    const agent = await this.agentManager.get(agentId);
    if (!agent) return [];

    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt)
      .all();

    const strategy = agent.memoryConfig?.strategy || 'sliding_window';
    const maxMessages = agent.memoryConfig?.maxMessages || 50;

    switch (strategy) {
      case 'sliding_window':
        // Keep only the most recent messages
        return allMessages.slice(-maxMessages).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      case 'summary':
        // Would implement summarization here
        // For now, just take last N messages
        const recent = allMessages.slice(-maxMessages);
        if (allMessages.length > maxMessages) {
          // Insert summary at the beginning
          const summaryMessage: ChatMessage = {
            role: 'system',
            content: `[Previous conversation summarized - ${allMessages.length - maxMessages} messages omitted]`,
          };
          return [summaryMessage, ...recent.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))];
        }
        return recent.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      case 'full':
      default:
        return allMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
    }
  }

  // Get memory usage stats for a session
  async getMemoryStats(sessionId: string, agentId: string): Promise<{
    totalMessages: number;
    contextMessages: number;
    estimatedTokens: number;
    percentageUsed: number;
  }> {
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .all();

    const contextMessages = await this.getContextMessages(sessionId, agentId);

    // Rough token estimate: ~4 chars per token
    const estimatedTokens = contextMessages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    const maxContext = 200000; // 200K tokens
    const percentageUsed = (estimatedTokens / maxContext) * 100;

    return {
      totalMessages: allMessages.length,
      contextMessages: contextMessages.length,
      estimatedTokens,
      percentageUsed,
    };
  }
}

// Singleton instances
let agentManager: AgentManager | null = null;
let memoryManager: MemoryManager | null = null;

export function getAgentManager(): AgentManager {
  if (!agentManager) {
    agentManager = new AgentManager();
  }
  return agentManager;
}

export function getMemoryManager(): MemoryManager {
  if (!memoryManager) {
    memoryManager = new MemoryManager(getAgentManager());
  }
  return memoryManager;
}