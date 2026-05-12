import type { Agent, AgentPersona, ToolDefinition } from '@agentic-os/types';

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: 'web' | 'data' | 'code' | 'file' | 'api' | 'custom';
  parameters: ToolParameters;
  requiresApproval: boolean;
  rateLimit?: number;
  handler: ToolHandler;
}

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

export interface ToolHandler {
  (params: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;
  userId: string;
  agentId: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  content: string;
  data?: unknown;
  error?: string;
}

// Agent persona presets
export const PERSONA_PRESETS: Record<string, Partial<AgentPersona>> = {
  professional: {
    tone: 'professional',
    systemPrompt: 'You are a professional business assistant. Be concise, clear, and action-oriented. Provide structured responses when appropriate.',
    temperature: 0.5,
  },
  casual: {
    tone: 'casual',
    systemPrompt: 'You are a friendly conversational assistant. Be warm, approachable, and engaging while remaining helpful and accurate.',
    temperature: 0.8,
  },
  technical: {
    tone: 'technical',
    systemPrompt: 'You are a technical expert assistant. Provide detailed, accurate technical information. Include code examples when relevant. Be precise and thorough.',
    temperature: 0.3,
  },
  creative: {
    tone: 'creative',
    systemPrompt: 'You are a creative assistant. Embrace creativity, offer multiple perspectives, and help brainstorm ideas. Think outside the box while staying grounded.',
    temperature: 1.0,
  },
};

// Memory strategies
export const MEMORY_STRATEGIES = {
  sliding_window: {
    name: 'Sliding Window',
    description: 'Keeps the most recent N messages. Simple and effective for most use cases.',
    maxMessagesRange: [5, 200],
    defaultMaxMessages: 50,
  },
  summary: {
    name: 'Summary',
    description: 'Periodically summarizes conversation to compress context. Better for long conversations.',
    maxMessagesRange: [10, 100],
    defaultMaxMessages: 20,
  },
  full: {
    name: 'Full Context',
    description: 'Keeps all messages. Best for short conversations or when full history is critical.',
    maxMessagesRange: [1, 1000],
    defaultMaxMessages: 100,
  },
} as const;

// Agent templates
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string[];
  author: string;
  config: {
    persona: Partial<AgentPersona>;
    tools: string[];
    memoryConfig: {
      strategy: 'sliding_window' | 'summary' | 'full';
      maxMessages: number;
    };
    defaultModelId: string;
  };
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'code-assistant',
    name: 'Code Assistant',
    description: 'Specialized for writing, reviewing, and debugging code',
    category: ['development', 'coding'],
    author: 'AgenticOS',
    config: {
      persona: {
        tone: 'technical',
        systemPrompt: 'You are an expert software engineer. Help with writing clean, efficient code. Provide explanations and suggest best practices.',
        temperature: 0.3,
        maxTokens: 4096,
      },
      tools: ['code_interpreter', 'web_search'],
      memoryConfig: { strategy: 'sliding_window', maxMessages: 30 },
      defaultModelId: 'claude-3-5-sonnet',
    },
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Analyzes data, generates insights, and creates visualizations',
    category: ['analytics', 'data'],
    author: 'AgenticOS',
    config: {
      persona: {
        tone: 'professional',
        systemPrompt: 'You are a skilled data analyst. Analyze datasets, identify patterns, and provide actionable insights. Present findings clearly.',
        temperature: 0.5,
        maxTokens: 4096,
      },
      tools: ['code_interpreter', 'calculator'],
      memoryConfig: { strategy: 'sliding_window', maxMessages: 50 },
      defaultModelId: 'gpt-4o',
    },
  },
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Handles customer inquiries with empathy and efficiency',
    category: ['support', 'customer-service'],
    author: 'AgenticOS',
    config: {
      persona: {
        tone: 'professional',
        systemPrompt: 'You are a helpful customer support agent. Be empathetic, patient, and solution-oriented. Ask clarifying questions when needed.',
        temperature: 0.7,
        maxTokens: 2048,
      },
      tools: ['web_search'],
      memoryConfig: { strategy: 'sliding_window', maxMessages: 100 },
      defaultModelId: 'claude-3-5-haiku',
    },
  },
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    description: 'Helps with research, summarization, and information gathering',
    category: ['research', 'writing'],
    author: 'AgenticOS',
    config: {
      persona: {
        tone: 'professional',
        systemPrompt: 'You are a research assistant. Help find, analyze, and summarize information. Cite sources and present balanced perspectives.',
        temperature: 0.5,
        maxTokens: 8192,
      },
      tools: ['web_search'],
      memoryConfig: { strategy: 'summary', maxMessages: 20 },
      defaultModelId: 'gemini-1.5-pro',
    },
  },
  {
    id: 'creative-writer',
    name: 'Creative Writer',
    description: 'Assists with creative writing, brainstorming, and content creation',
    category: ['writing', 'creative'],
    author: 'AgenticOS',
    config: {
      persona: {
        tone: 'creative',
        systemPrompt: 'You are a creative writing assistant. Help with brainstorming, drafting, and refining creative content. Embrace imaginative approaches.',
        temperature: 0.9,
        maxTokens: 4096,
      },
      tools: [],
      memoryConfig: { strategy: 'sliding_window', maxMessages: 20 },
      defaultModelId: 'claude-3-5-sonnet',
    },
  },
];

// Agent validation
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