/**
 * Phase 5.5 — exercises the four states the Agents page can be in:
 * loading, error, empty, and populated. The api module is mocked so the
 * component can be tested in isolation from the backend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Agent, Model } from '@agentic-os/types';

// Next.js router shim — agents.tsx doesn't use it, but other imported modules
// might pull in `next/router`.
vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), pathname: '/agents', query: {} }),
}));

// Mock the api module before the page is imported.
const getAgents = vi.fn();
const getModels = vi.fn();
const deleteAgent = vi.fn();
const createAgent = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    getAgents: () => getAgents(),
    getModels: () => getModels(),
    deleteAgent: (id: string) => deleteAgent(id),
    createAgent: (input: unknown) => createAgent(input),
  },
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

// Need to import after the mocks are set up.
const { default: AgentsPage } = await import('../src/pages/agents');

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AgentsPage />
    </QueryClientProvider>,
  );
}

const FIXTURE_AGENT: Agent = {
  id: 'agent-1',
  name: 'Test Agent',
  description: 'A real agent from the DB',
  persona: {
    tone: 'professional',
    systemPrompt: 'You are helpful.',
    temperature: 0.7,
    maxTokens: 4096,
    knowledgeBases: [],
  },
  tools: [],
  defaultModelId: 'claude-3-5-sonnet',
  memoryConfig: { strategy: 'sliding_window', maxMessages: 50 },
  rateLimit: 60,
  createdBy: 'local',
  isTemplate: false,
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const FIXTURE_MODEL: Model = {
  id: 'claude-3-5-sonnet',
  providerId: 'anthropic',
  name: 'claude-3-5-sonnet',
  displayName: 'Claude 3.5 Sonnet',
  contextWindow: 200_000,
  inputCostPer1M: 3,
  outputCostPer1M: 15,
  supportsStreaming: true,
  supportsVision: true,
  supportsFunctionCalling: true,
  status: 'active',
  metadata: {},
};

describe('AgentsPage', () => {
  beforeEach(() => {
    getAgents.mockReset();
    getModels.mockReset();
    deleteAgent.mockReset();
    createAgent.mockReset();
    getModels.mockResolvedValue([FIXTURE_MODEL]);
  });

  afterEach(() => cleanup());

  it('renders a loading skeleton while fetching', async () => {
    let resolve!: (value: Agent[]) => void;
    getAgents.mockImplementation(
      () => new Promise<Agent[]>((r) => (resolve = r)),
    );
    const { container } = renderPage();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    // Resolve to clean up the pending query before the test ends.
    resolve([]);
    await waitFor(() => expect(getAgents).toHaveBeenCalled());
  });

  it('renders an empty state when no agents exist', async () => {
    getAgents.mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText(/no agents yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create your first agent/i }),
    ).toBeInTheDocument();
  });

  it('renders an error banner with retry when the fetch fails', async () => {
    getAgents.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText(/failed to load agents/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders the agent card with name, description, and model when populated', async () => {
    getAgents.mockResolvedValueOnce([FIXTURE_AGENT]);
    renderPage();
    expect(await screen.findByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('A real agent from the DB')).toBeInTheDocument();
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
  });
});
