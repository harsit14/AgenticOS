// API client for dashboard
// This will be enhanced with proper error handling and caching

import type { DashboardMetrics } from '@agentic-os/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  try {
    const [usage, sessions] = await Promise.all([
      fetchApi<{ today: { cost: number }; week: { cost: number }; month: { cost: number } }>('/api/usage'),
      fetchApi<{ items: Array<{ status: string }> }>('/api/sessions?status=active'),
    ]);

    // Mock data for demonstration - will be replaced with real data
    return {
      totalSpend: {
        today: usage?.today?.cost ?? 0,
        week: usage?.week?.cost ?? 0,
        month: usage?.month?.cost ?? 0,
      },
      activeSessions: sessions?.items?.filter((s) => s.status === 'active').length ?? 0,
      topAgents: [
        { agentId: 'demo-1', name: 'Code Assistant', requestCount: 150, cost: 2.5, tokens: 125000 },
        { agentId: 'demo-2', name: 'Data Analyst', requestCount: 89, cost: 1.8, tokens: 89000 },
        { agentId: 'demo-3', name: 'Customer Support', requestCount: 67, cost: 1.2, tokens: 67000 },
      ],
      costTrend: [
        { date: '2024-05-05', cost: 12.5 },
        { date: '2024-05-06', cost: 15.2 },
        { date: '2024-05-07', cost: 11.8 },
        { date: '2024-05-08', cost: 18.4 },
        { date: '2024-05-09', cost: 14.9 },
        { date: '2024-05-10', cost: 16.2 },
        { date: '2024-05-11', cost: 19.1 },
      ],
      tokenDistribution: [
        { model: 'Claude 3.5 Sonnet', tokens: 180000 },
        { model: 'GPT-4o', tokens: 95000 },
        { model: 'Llama 3', tokens: 45000 },
      ],
      todayTokens: 320000,
    };
  } catch {
    // Return empty state on error
    return {
      totalSpend: { today: 0, week: 0, month: 0 },
      activeSessions: 0,
      topAgents: [],
      costTrend: [],
      tokenDistribution: [],
      todayTokens: 0,
    };
  }
}

export async function getAgents() {
  return fetchApi<Array<unknown>>('/api/agents');
}

export async function getModels() {
  return fetchApi<Array<unknown>>('/api/models');
}

export async function getProviders() {
  return fetchApi<Array<unknown>>('/api/providers');
}

export async function getSessions() {
  return fetchApi<Array<unknown>>('/api/sessions');
}

export async function createAgent(data: unknown) {
  const res = await fetch(`${API_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}