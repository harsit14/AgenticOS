import { create } from 'zustand';
import type { Agent, Session } from '@agentic-os/types';

interface AppState {
  agents: Agent[];
  activeSession: Session | null;
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  setActiveSession: (session: Session | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  agents: [],
  activeSession: null,

  setAgents: (agents) => set({ agents }),

  addAgent: (agent) => set((state) => ({
    agents: [...state.agents, agent],
  })),

  updateAgent: (id, updates) => set((state) => ({
    agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
  })),

  removeAgent: (id) => set((state) => ({
    agents: state.agents.filter((a) => a.id !== id),
  })),

  setActiveSession: (session) => set({ activeSession: session }),
}));