'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { AlertCircle, DollarSign, Bot, Cpu, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import type { Model, Agent } from '@agentic-os/types';

const RANGES = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

export default function AnalyticsPage() {
  const [range, setRange] = React.useState('7d');

  const dailyQuery = useQuery({
    queryKey: ['usage', 'daily', range],
    queryFn: () => api.getUsageDaily(range),
  });
  const byModelQuery = useQuery({
    queryKey: ['usage', 'by-model', range],
    queryFn: () => api.getUsageByModel(range),
  });
  const byAgentQuery = useQuery({
    queryKey: ['usage', 'by-agent', range],
    queryFn: () => api.getUsageByAgent(range),
  });
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: api.getModels });
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: api.getAgents });

  const totals = React.useMemo(() => {
    const rows = dailyQuery.data ?? [];
    return rows.reduce(
      (acc, r) => ({
        cost: acc.cost + r.cost,
        tokens: acc.tokens + r.tokens,
        requests: acc.requests + r.requests,
      }),
      { cost: 0, tokens: 0, requests: 0 },
    );
  }, [dailyQuery.data]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Cost and usage over time</p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {dailyQuery.isError && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-center gap-3 text-sm text-destructive">
            <AlertCircle className="w-5 h-5" />
            Failed to load analytics: {(dailyQuery.error as Error)?.message}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Total cost"
          value={`$${totals.cost.toFixed(4)}`}
        />
        <KpiCard
          icon={<Zap className="w-5 h-5" />}
          label="Tokens"
          value={totals.tokens.toLocaleString()}
        />
        <KpiCard
          icon={<Bot className="w-5 h-5" />}
          label="Requests"
          value={totals.requests.toLocaleString()}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily cost</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyQuery.isLoading ? (
            <ChartSkeleton />
          ) : (dailyQuery.data?.length ?? 0) === 0 ? (
            <EmptyState text="No usage in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyQuery.data}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => `$${value.toFixed(4)}`}
                  labelStyle={{ color: '#000' }}
                />
                <Area type="monotone" dataKey="cost" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5" />
              Cost by model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsageBarChart
              query={byModelQuery}
              labels={modelsQuery.data ?? []}
              labelOf={(id, items) => (items as Model[]).find((m) => m.id === id)?.displayName ?? id}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Cost by agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsageBarChart
              query={byAgentQuery}
              labels={agentsQuery.data ?? []}
              labelOf={(id, items) => (items as Agent[]).find((a) => a.id === id)?.name ?? id}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return <div className="h-[260px] bg-muted rounded animate-pulse" />;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function UsageBarChart<T>({
  query,
  labels,
  labelOf,
}: {
  query: { data?: Array<{ id: string; cost: number; tokens: number; requests: number }>; isLoading: boolean };
  labels: T[];
  labelOf: (id: string, items: T[]) => string;
}) {
  if (query.isLoading) return <ChartSkeleton />;
  const rows = query.data ?? [];
  if (rows.length === 0) return <EmptyState text="No data" />;

  const data = rows.map((r) => ({
    name: labelOf(r.id, labels),
    cost: r.cost,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number) => `$${value.toFixed(4)}`}
          labelStyle={{ color: '#000' }}
        />
        <Bar dataKey="cost" fill="#3b82f6" />
      </BarChart>
    </ResponsiveContainer>
  );
}
