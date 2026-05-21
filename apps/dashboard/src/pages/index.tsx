'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, AlertCircle, Bot, DollarSign, Zap } from 'lucide-react';
import { api } from '@/lib/api';

export default function DashboardHome() {
  const summaryQuery = useQuery({ queryKey: ['usage', 'summary'], queryFn: api.getUsageSummary });
  const dailyQuery = useQuery({ queryKey: ['usage', 'daily', '7d'], queryFn: () => api.getUsageDaily('7d') });
  const topAgentsQuery = useQuery({ queryKey: ['agents', 'top'], queryFn: () => api.getTopAgents(5) });
  const recentQuery = useQuery({ queryKey: ['sessions', 'recent'], queryFn: () => api.getRecentSessions(5) });

  const summary = summaryQuery.data;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Agentic OS — local-first overview</p>
      </div>

      {summaryQuery.isError && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-center gap-3 text-sm text-destructive">
            <AlertCircle className="w-5 h-5" />
            Failed to load summary: {(summaryQuery.error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi
          icon={<DollarSign className="w-5 h-5" />}
          label="Today"
          value={summary ? `$${summary.today.cost.toFixed(4)}` : '—'}
          subtle={summary ? `${summary.today.requests} requests` : ''}
        />
        <Kpi
          icon={<DollarSign className="w-5 h-5" />}
          label="This week"
          value={summary ? `$${summary.week.cost.toFixed(2)}` : '—'}
          subtle={summary ? `${summary.week.tokens.toLocaleString()} tokens` : ''}
        />
        <Kpi
          icon={<DollarSign className="w-5 h-5" />}
          label="This month"
          value={summary ? `$${summary.month.cost.toFixed(2)}` : '—'}
          subtle={summary ? `${summary.month.requests} requests` : ''}
        />
        <Kpi
          icon={<Activity className="w-5 h-5" />}
          label="Active sessions"
          value={summary ? String(summary.activeSessions) : '—'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost — last 7 days</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyQuery.isLoading ? (
            <div className="h-[260px] bg-muted rounded animate-pulse" />
          ) : (dailyQuery.data?.length ?? 0) === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
              No usage yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyQuery.data}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `$${value.toFixed(4)}`} labelStyle={{ color: '#000' }} />
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
              <Bot className="w-5 h-5" />
              Top agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topAgentsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (topAgentsQuery.data?.length ?? 0) === 0 ? (
              <EmptyMini text="No usage yet." />
            ) : (
              <ul className="space-y-2">
                {topAgentsQuery.data!.map((a) => (
                  <li key={a.agentId} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted-foreground">
                      {a.requestCount} req · ${a.cost.toFixed(4)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Recent sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (recentQuery.data?.length ?? 0) === 0 ? (
              <EmptyMini text="No sessions yet." />
            ) : (
              <ul className="space-y-2">
                {recentQuery.data!.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <Link
                      href={`/sessions/${s.id}`}
                      className="font-medium hover:underline truncate max-w-[60%]"
                    >
                      {s.agentName ?? s.id}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {s.status}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {formatTimeAgo(s.startedAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  subtle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtle && <p className="text-xs text-muted-foreground">{subtle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground text-center py-6">{text}</p>;
}

function formatTimeAgo(date: string | Date | undefined): string {
  if (!date) return '—';
  const ms = Date.now() - new Date(date).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
