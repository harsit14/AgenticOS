// Tool registry API for dashboard
import type { Tool } from '@agentic-os/types';

export type { Tool };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// The agent tools endpoint also exposes a runtime-only `category` field.
export type DashboardTool = Tool & { category?: string };

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

async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

export async function getTools(): Promise<DashboardTool[]> {
  try {
    return await fetchApi<DashboardTool[]>('/api/agents/tools');
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

export async function getModels() {
  return fetchApi<Array<{ id: string; displayName: string; contextWindow: number }>>('/api/models');
}