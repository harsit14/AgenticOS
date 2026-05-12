'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Button } from '../components/ui/button';
import {
  calculateContextBreakdown,
  getMemoryPressureLevel,
  getMemoryPressureColor,
  generateOptimizationSuggestions,
  type MemoryPressureLevel,
} from '@agentic-os/types';
import { AlertTriangle, Zap, Trash2, Minimize2, Lightbulb } from 'lucide-react';

interface ContextVisualizerProps {
  contextWindow: number;
  systemPromptTokens: number;
  toolsTokens: number;
  historyTokens: number;
  ragTokens?: number;
  onOptimize?: (action: string) => void;
}

export function ContextVisualizer({
  contextWindow,
  systemPromptTokens,
  toolsTokens,
  historyTokens,
  ragTokens = 0,
  onOptimize,
}: ContextVisualizerProps) {
  const breakdown = useMemo(
    () => calculateContextBreakdown(contextWindow, systemPromptTokens, toolsTokens, historyTokens, ragTokens),
    [contextWindow, systemPromptTokens, toolsTokens, historyTokens, ragTokens]
  );

  const pressureLevel = getMemoryPressureLevel(breakdown.utilizationPercent);
  const pressureColor = getMemoryPressureColor(pressureLevel);
  const suggestions = useMemo(
    () => generateOptimizationSuggestions(breakdown, contextWindow),
    [breakdown, contextWindow]
  );

  const getPressureLabel = (level: MemoryPressureLevel): string => {
    const labels: Record<MemoryPressureLevel, string> = {
      green: 'Healthy',
      yellow: 'Caution',
      red: 'Warning',
      critical: 'Critical',
    };
    return labels[level];
  };

  return (
    <div className="space-y-4">
      {/* Header with pressure indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: pressureColor }}
          />
          <span className="font-medium">{getPressureLabel(pressureLevel)}</span>
        </div>
        <Badge
          variant={pressureLevel === 'green' ? 'default' : pressureLevel === 'critical' ? 'destructive' : 'secondary'}
          style={{ backgroundColor: pressureColor }}
        >
          {breakdown.utilizationPercent.toFixed(1)}% used
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <Progress
          value={breakdown.utilizationPercent}
          className="h-4"
          style={{
            '--progress-color': pressureColor,
          } as React.CSSProperties}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span>{breakdown.totalLimit.toLocaleString()} tokens</span>
        </div>
      </div>

      {/* Breakdown segments */}
      <div className="flex flex-wrap gap-2">
        {breakdown.segments.filter(s => s.type !== 'available').map((segment) => (
          <div
            key={segment.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
            style={{
              backgroundColor: `${segment.color}20`,
              border: `1px solid ${segment.color}`,
            }}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span>{segment.name}:</span>
            <span className="font-medium">{segment.tokens.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Available space */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Available for new messages:</span>
        <span className="font-medium text-green-500">
          {breakdown.availableTokens.toLocaleString()} tokens
        </span>
      </div>

      {/* Warning for high utilization */}
      {(pressureLevel === 'red' || pressureLevel === 'critical') && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Context window almost full</p>
              <p className="text-xs text-muted-foreground mt-1">
                Consider truncating history or disabling unused tools
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Optimization suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Optimization Suggestions
          </h4>
          <div className="space-y-2">
            {suggestions.slice(0, 3).map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {suggestion.type === 'truncate' && <Trash2 className="w-4 h-4 text-orange-500" />}
                  {suggestion.type === 'disable_tool' && <Zap className="w-4 h-4 text-blue-500" />}
                  {suggestion.type === 'summarize' && <Minimize2 className="w-4 h-4 text-purple-500" />}
                  <span className="text-sm">{suggestion.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    +{Math.round(suggestion.tokensSaved).toLocaleString()} tokens
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => onOptimize?.(suggestion.action)}>
                    Apply
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Token counter for messages
export function TokenCounter({ messages }: { messages: Array<{ role: string; content: string }> }) {
  const total = useMemo(() => {
    return messages.reduce((sum, msg) => {
      return sum + Math.ceil(msg.content.length / 4) + 4; // ~4 chars per token + role prefix
    }, 0);
  }, [messages]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Tokens:</span>
      <Badge variant="secondary">{total.toLocaleString()}</Badge>
    </div>
  );
}

// Circular visualization
export function ContextCircle({ breakdown }: { breakdown: ReturnType<typeof calculateContextBreakdown> }) {
  const pressureLevel = getMemoryPressureLevel(breakdown.utilizationPercent);
  const pressureColor = getMemoryPressureColor(pressureLevel);

  return (
    <div className="relative w-32 h-32">
      <svg viewBox="0 0 100 100" className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        {/* Used portion */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={pressureColor}
          strokeWidth="8"
          strokeDasharray={`${breakdown.utilizationPercent * 2.83} 283`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color: pressureColor }}>
          {breakdown.utilizationPercent.toFixed(0)}%
        </span>
        <span className="text-xs text-muted-foreground">utilized</span>
      </div>
    </div>
  );
}