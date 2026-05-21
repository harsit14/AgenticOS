import type { Agent, AgentPersona } from '@agentic-os/types';

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  default?: unknown;
  enum?: string[];
}

export interface ToolContext {
  sessionId: string;
  agentId: string;
  metadata?: Record<string, unknown>;
}

// Local-only tool execution result; richer than the wire-level ToolResult in @agentic-os/types.
export interface ToolExecutionResult {
  success: boolean;
  content: string;
  data?: unknown;
  error?: string;
}

export interface ToolHandler {
  (params: unknown, context: ToolContext): Promise<ToolExecutionResult>;
}

// Runtime tool — extends the canonical Tool data shape (from @agentic-os/types)
// with a Node-side handler and a category. Lives in the in-memory ToolRegistry.
export interface RuntimeTool {
  id: string;
  name: string;
  description: string;
  category: 'web' | 'data' | 'code' | 'file' | 'api' | 'custom';
  parameters: ToolParameters;
  requiresApproval: boolean;
  rateLimit?: number;
  handler: ToolHandler;
}

export const PERSONA_PRESETS: Record<string, Partial<AgentPersona>> = {
  professional: {
    tone: 'professional',
    systemPrompt:
      'You are a professional business assistant. Be concise, clear, and action-oriented. Provide structured responses when appropriate.',
    temperature: 0.5,
  },
  casual: {
    tone: 'casual',
    systemPrompt:
      'You are a friendly conversational assistant. Be warm, approachable, and engaging while remaining helpful and accurate.',
    temperature: 0.8,
  },
  technical: {
    tone: 'technical',
    systemPrompt:
      'You are a technical expert assistant. Provide detailed, accurate technical information. Include code examples when relevant. Be precise and thorough.',
    temperature: 0.3,
  },
  creative: {
    tone: 'creative',
    systemPrompt:
      'You are a creative assistant. Embrace creativity, offer multiple perspectives, and help brainstorm ideas. Think outside the box while staying grounded.',
    temperature: 1.0,
  },
};

export const MEMORY_STRATEGIES = {
  sliding_window: {
    name: 'Sliding Window',
    description: 'Keeps the most recent N messages. Simple and effective for most use cases.',
    maxMessagesRange: [5, 200],
    defaultMaxMessages: 50,
  },
  summary: {
    name: 'Summary',
    description:
      'Periodically summarizes conversation to compress context. Better for long conversations.',
    maxMessagesRange: [10, 100],
    defaultMaxMessages: 20,
  },
  full: {
    name: 'Full Context',
    description:
      'Keeps all messages. Best for short conversations or when full history is critical.',
    maxMessagesRange: [1, 1000],
    defaultMaxMessages: 100,
  },
} as const;

export function validateAgent(agent: Partial<Agent>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!agent.name || agent.name.trim().length < 2) {
    errors.push('Agent name must be at least 2 characters');
  }

  if (!agent.defaultModelId) {
    errors.push('Default model is required');
  }

  if (agent.persona) {
    if (typeof agent.persona !== 'object') {
      errors.push('Persona must be an object');
    } else {
      const persona = agent.persona as AgentPersona;
      if (persona.temperature !== undefined && (persona.temperature < 0 || persona.temperature > 2)) {
        errors.push('Temperature must be between 0 and 2');
      }
      if (persona.maxTokens !== undefined && persona.maxTokens < 1) {
        errors.push('Max tokens must be at least 1');
      }
    }
  }

  if (agent.memoryConfig) {
    const validStrategies = ['sliding_window', 'summary', 'full'];
    if (!validStrategies.includes(agent.memoryConfig.strategy)) {
      errors.push(`Memory strategy must be one of: ${validStrategies.join(', ')}`);
    }
    if (agent.memoryConfig.maxMessages < 1) {
      errors.push('Max messages must be at least 1');
    }
  }

  return { valid: errors.length === 0, errors };
}
