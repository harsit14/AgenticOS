// Context window visualization types

export interface ContextWindowBreakdown {
  totalLimit: number;
  usedTokens: number;
  availableTokens: number;
  utilizationPercent: number;
  segments: ContextSegment[];
}

export interface ContextSegment {
  id: string;
  name: string;
  type: 'system_prompt' | 'tools' | 'history' | 'rag_context' | 'available';
  tokens: number;
  color: string;
  maxTokens?: number;
}

export type MemoryPressureLevel = 'green' | 'yellow' | 'red' | 'critical';

export interface OptimizationSuggestion {
  id: string;
  type: 'truncate' | 'disable_tool' | 'summarize' | 'compress';
  description: string;
  tokensSaved: number;
  action: string;
  priority: 'high' | 'medium' | 'low';
}

export interface TokenBudget {
  maxTokens: number;
  reservedSystem: number;
  reservedTools: number;
  reservedRag: number;
  availableForHistory: number;
}

export const CONTEXT_COLORS = {
  system_prompt: '#3b82f6',  // blue
  tools: '#f97316',         // orange
  history: '#22c55e',       // green
  rag_context: '#a855f7',   // purple
  available: '#6b7280',     // gray
};

export const MEMORY_PRESSURE_THRESHOLDS = {
  green: 50,      // < 50% - healthy
  yellow: 80,    // 50-80% - caution
  red: 95,       // 80-95% - warning
  critical: 100, // > 95% - must truncate
};

export function calculateContextBreakdown(
  contextWindow: number,
  systemPromptTokens: number,
  toolsTokens: number,
  historyTokens: number,
  ragTokens: number = 0
): ContextWindowBreakdown {
  const usedTokens = systemPromptTokens + toolsTokens + historyTokens + ragTokens;
  const availableTokens = Math.max(0, contextWindow - usedTokens);
  const utilizationPercent = (usedTokens / contextWindow) * 100;

  const segments: ContextSegment[] = [
    {
      id: 'system',
      name: 'System Prompt',
      type: 'system_prompt',
      tokens: systemPromptTokens,
      color: CONTEXT_COLORS.system_prompt,
    },
    {
      id: 'tools',
      name: 'Tools',
      type: 'tools',
      tokens: toolsTokens,
      color: CONTEXT_COLORS.tools,
    },
    {
      id: 'history',
      name: 'History',
      type: 'history',
      tokens: historyTokens,
      color: CONTEXT_COLORS.history,
    },
  ];

  if (ragTokens > 0) {
    segments.push({
      id: 'rag',
      name: 'RAG Context',
      type: 'rag_context',
      tokens: ragTokens,
      color: CONTEXT_COLORS.rag_context,
    });
  }

  segments.push({
    id: 'available',
    name: 'Available',
    type: 'available',
    tokens: availableTokens,
    color: CONTEXT_COLORS.available,
  });

  return {
    totalLimit: contextWindow,
    usedTokens,
    availableTokens,
    utilizationPercent,
    segments,
  };
}

export function getMemoryPressureLevel(utilizationPercent: number): MemoryPressureLevel {
  if (utilizationPercent < MEMORY_PRESSURE_THRESHOLDS.green) {
    return 'green';
  } else if (utilizationPercent < MEMORY_PRESSURE_THRESHOLDS.yellow) {
    return 'yellow';
  } else if (utilizationPercent < MEMORY_PRESSURE_THRESHOLDS.red) {
    return 'red';
  }
  return 'critical';
}

export function getMemoryPressureColor(level: MemoryPressureLevel): string {
  const colors: Record<MemoryPressureLevel, string> = {
    green: '#22c55e',
    yellow: '#f59e0b',
    red: '#ef4444',
    critical: '#dc2626',
  };
  return colors[level];
}

export function generateOptimizationSuggestions(
  breakdown: ContextWindowBreakdown,
  maxTokens: number
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const availablePercent = (breakdown.availableTokens / breakdown.totalLimit) * 100;

  if (availablePercent < 20) {
    // Suggest truncating history
    const historySegment = breakdown.segments.find(s => s.type === 'history');
    if (historySegment && historySegment.tokens > 1000) {
      suggestions.push({
        id: 'truncate-history',
        type: 'truncate',
        description: 'Remove oldest messages from conversation history',
        tokensSaved: Math.min(historySegment.tokens * 0.3, breakdown.availableTokens * 0.5),
        action: 'truncate_history',
        priority: 'high',
      });
    }

    // Suggest disabling tools
    const toolsSegment = breakdown.segments.find(s => s.type === 'tools');
    if (toolsSegment && toolsSegment.tokens > 500) {
      suggestions.push({
        id: 'disable-tools',
        type: 'disable_tool',
        description: 'Disable unused tools to free up context space',
        tokensSaved: toolsSegment.tokens * 0.5,
        action: 'manage_tools',
        priority: 'medium',
      });
    }
  }

  if (availablePercent < 5) {
    // Critical - suggest summarization
    suggestions.push({
      id: 'summarize',
      type: 'summarize',
      description: 'Summarize conversation history to fit within context window',
      tokensSaved: breakdown.usedTokens * 0.4,
      action: 'summarize_history',
      priority: 'high',
    });
  }

  // Always suggest compression if available
  suggestions.push({
    id: 'compress',
    type: 'compress',
    description: 'Use shorter variable names and remove redundant context',
    tokensSaved: breakdown.usedTokens * 0.05,
    action: 'optimize_prompt',
    priority: 'low',
  });

  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

export function calculateTokenBudget(
  contextWindow: number,
  agentConfig: {
    systemPromptTokens: number;
    maxToolCalls: number;
    avgToolDefinitionTokens: number;
    ragEnabled: boolean;
    ragTokens: number;
  }
): TokenBudget {
  const reservedSystem = agentConfig.systemPromptTokens;
  const reservedTools = agentConfig.maxToolCalls * agentConfig.avgToolDefinitionTokens;
  const reservedRag = agentConfig.ragEnabled ? agentConfig.ragTokens : 0;

  const reserved = reservedSystem + reservedTools + reservedRag;
  const availableForHistory = Math.max(0, contextWindow - reserved);

  return {
    maxTokens: contextWindow,
    reservedSystem,
    reservedTools,
    reservedRag,
    availableForHistory,
  };
}

// Token counting utilities
export function countTokens(text: string): number {
  // Approximate token count: ~4 chars per token for English
  // This is a rough approximation - use actual tokenizer in production
  return Math.ceil(text.length / 4);
}

export function countTokensForMessages(
  messages: Array<{ role: string; content: string }>
): number {
  return messages.reduce((total, msg) => {
    // Role prefix tokens + content tokens
    return total + countTokens(msg.content) + 4;
  }, 0);
}

export function truncateToTokenLimit(
  text: string,
  maxTokens: number
): { truncated: string; removedTokens: number } {
  const tokens = countTokens(text);
  if (tokens <= maxTokens) {
    return { truncated: text, removedTokens: 0 };
  }

  // Binary search for the right truncation point
  let left = 0;
  let right = text.length;
  const targetTokens = maxTokens;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const truncated = text.substring(0, mid);
    if (countTokens(truncated) <= targetTokens) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const truncated = text.substring(0, left);
  return {
    truncated,
    removedTokens: tokens - countTokens(truncated),
  };
}