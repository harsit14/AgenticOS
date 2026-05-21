import type { Agent, AgentPersona, Model, Provider, Session, Message } from '@agentic-os/types';

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body?.error?.message ?? res.statusText,
      body?.error?.code,
    );
  }
  const body = await res.json();
  return body.data as T;
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  defaultModelId: string;
  persona: Partial<AgentPersona> & { systemPrompt: string };
  tools?: string[];
  memoryConfig?: { strategy: 'sliding_window' | 'summary' | 'full'; maxMessages: number };
  tags?: string[];
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  defaultModelId?: string;
  persona?: Partial<AgentPersona>;
  tools?: string[];
  memoryConfig?: { strategy: 'sliding_window' | 'summary' | 'full'; maxMessages: number };
  tags?: string[];
}

export interface CreateSessionInput {
  agentId: string;
  modelId?: string;
}

export interface SendMessageInput {
  content: string;
}

export interface SendMessageResult {
  userMessage: Message;
  assistantMessage: Message;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  costUsd: number;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: (result: {
    messageId: string;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    costUsd: number;
  }) => void;
  onError: (message: string) => void;
}

export interface UsageSummary {
  today: { cost: number; tokens: number; requests: number };
  week: { cost: number; tokens: number; requests: number };
  month: { cost: number; tokens: number; requests: number };
  activeSessions: number;
}

export interface UsageDailyPoint {
  date: string;
  cost: number;
  tokens: number;
  requests: number;
}

export interface UsageGroupRow {
  id: string;
  cost: number;
  tokens: number;
  requests: number;
}

export interface TopAgent {
  agentId: string;
  name: string;
  requestCount: number;
  tokens: number;
  cost: number;
}

export interface RecentSession extends Session {
  agentName: string | null;
}

export interface TestProviderResult {
  ok: boolean;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface AvailableTool {
  id: string;
  name: string;
  description: string;
  category: string;
  requiresApproval: boolean;
}

export const api = {
  // Agents
  getAgents: () => request<Agent[]>('/api/agents'),
  getTopAgents: (limit = 5) => request<TopAgent[]>(`/api/agents/top?limit=${limit}`),
  getTools: () => request<AvailableTool[]>('/api/agents/tools'),
  getAgent: (id: string) => request<Agent>(`/api/agents/${id}`),
  createAgent: (input: CreateAgentInput) =>
    request<Agent>('/api/agents', {
      method: 'POST',
      body: JSON.stringify({ ...input, createdBy: 'local' }),
    }),
  updateAgent: (id: string, input: UpdateAgentInput) =>
    request<Agent>(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteAgent: (id: string) =>
    request<{ deleted: boolean }>(`/api/agents/${id}`, { method: 'DELETE' }),

  // Models + providers
  getModels: () => request<Model[]>('/api/models'),
  getProviders: () => request<Provider[]>('/api/providers'),

  // Sessions
  getSessions: (params?: { status?: string; agentId?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.agentId) query.set('agentId', params.agentId);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<Session[]>(`/api/sessions${suffix}`);
  },
  getSession: (id: string) => request<Session & { agent: { id: string; name: string } | null }>(`/api/sessions/${id}`),
  getMessages: (sessionId: string) => request<Message[]>(`/api/sessions/${sessionId}/messages`),
  createSession: (input: CreateSessionInput) =>
    request<Session>('/api/sessions', { method: 'POST', body: JSON.stringify(input) }),
  sendMessage: (sessionId: string, input: SendMessageInput) =>
    request<SendMessageResult>(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  // Stream a reply over SSE. Resolves once the stream ends.
  streamMessage: async (
    sessionId: string,
    content: string,
    handlers: StreamHandlers,
  ): Promise<void> => {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      handlers.onError(body?.error?.message ?? `HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let event: { type: string; [k: string]: unknown };
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (event.type === 'delta') {
          handlers.onDelta(event.content as string);
        } else if (event.type === 'done') {
          handlers.onDone({
            messageId: event.messageId as string,
            usage: event.usage as {
              inputTokens: number;
              outputTokens: number;
              totalTokens: number;
            },
            costUsd: event.costUsd as number,
          });
        } else if (event.type === 'error') {
          handlers.onError(event.message as string);
        }
      }
    }
  },
  endSession: (id: string) =>
    request<Session>(`/api/sessions/${id}/end`, { method: 'POST' }),
  getRecentSessions: (limit = 5) =>
    request<RecentSession[]>(`/api/sessions/recent?limit=${limit}`),

  // Usage
  getUsageSummary: () => request<UsageSummary>('/api/usage/summary'),
  getUsageDaily: (range = '7d') =>
    request<UsageDailyPoint[]>(`/api/usage/aggregate?groupBy=day&range=${range}`),
  getUsageByModel: (range = '30d') =>
    request<UsageGroupRow[]>(`/api/usage/aggregate?groupBy=model&range=${range}`),
  getUsageByAgent: (range = '30d') =>
    request<UsageGroupRow[]>(`/api/usage/aggregate?groupBy=agent&range=${range}`),

  // Providers
  testProvider: (id: string) =>
    request<TestProviderResult>(`/api/providers/${id}/test`, { method: 'POST' }),
  discoverLocalModels: (id: string) =>
    request<{ ok: boolean; models?: Array<{ id: string }>; error?: string }>(
      `/api/providers/${id}/local-models`,
    ),
  registerLocalModel: (
    providerId: string,
    input: { name: string; displayName?: string; contextWindow?: number },
  ) =>
    request<Model>(`/api/providers/${providerId}/register-model`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Settings
  getSettings: () => request<Record<string, unknown>>('/api/settings'),
  getSetting: <T>(key: string) => request<T>(`/api/settings/${key}`),
  setSetting: <T>(key: string, value: T) =>
    request<{ key: string; saved: true }>(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
};
