// Tool registry API for dashboard

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
}

export interface PersonaPreset {
  id: string;
  name: string;
  tone: string;
  description?: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface MemoryStrategy {
  id: string;
  name: string;
  description: string;
  defaultMaxMessages: number;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string[];
  author: string;
  config: {
    defaultModelId: string;
    tools: string[];
    memoryConfig: {
      strategy: string;
      maxMessages: number;
    };
  };
}

async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

export async function getTools(): Promise<Tool[]> {
  try {
    return await fetchApi<Tool[]>('/api/agents/tools');
  } catch {
    return [];
  }
}

export async function getPersonaPresets(): Promise<PersonaPreset[]> {
  try {
    return await fetchApi<PersonaPreset[]>('/api/agents/persona-presets');
  } catch {
    return [];
  }
}

export async function getMemoryStrategies(): Promise<MemoryStrategy[]> {
  try {
    return await fetchApi<MemoryStrategy[]>('/api/agents/memory-strategies');
  } catch {
    return [];
  }
}

export async function getAgentTemplates(): Promise<AgentTemplate[]> {
  try {
    return await fetchApi<AgentTemplate[]>('/api/agents/templates');
  } catch {
    return [];
  }
}

export async function getModels() {
  return fetchApi<Array<{ id: string; displayName: string; contextWindow: number }>>('/api/models');
}