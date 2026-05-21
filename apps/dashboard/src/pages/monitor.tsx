'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Activity, AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { Agent } from '@agentic-os/types';

export default function MonitorPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [selectedAgentId, setSelectedAgentId] = React.useState('');

  const sessionsQuery = useQuery({
    queryKey: ['sessions', { status: 'active' }],
    queryFn: () => api.getSessions({ status: 'active' }),
    refetchInterval: 5_000,
  });
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: api.getAgents });

  const startMutation = useMutation({
    mutationFn: (agentId: string) => api.createSession({ agentId }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', { status: 'active' }] });
      router.push(`/sessions/${session.id}`);
    },
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Live Monitor</h1>
          <p className="text-muted-foreground">
            Active sessions refresh every 5 seconds.
          </p>
        </div>
        <Button onClick={() => setCreating((s) => !s)}>
          <Plus className="w-4 h-4 mr-2" />
          Start session
        </Button>
      </div>

      {creating && (
        <NewSessionPanel
          agents={agentsQuery.data ?? []}
          loading={agentsQuery.isLoading}
          selectedAgentId={selectedAgentId}
          onSelect={setSelectedAgentId}
          onStart={() => startMutation.mutate(selectedAgentId)}
          pending={startMutation.isPending}
          error={
            startMutation.isError ? (startMutation.error as Error).message : null
          }
        />
      )}

      {sessionsQuery.isLoading && <Loading />}

      {sessionsQuery.isError && (
        <ErrorBanner
          message={(sessionsQuery.error as Error)?.message ?? 'Failed to load sessions'}
          onRetry={() => sessionsQuery.refetch()}
        />
      )}

      {sessionsQuery.data && sessionsQuery.data.length === 0 && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center space-y-3">
            <Activity className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No active sessions</p>
            <p className="text-sm text-muted-foreground">
              Start a session above to chat with one of your agents.
            </p>
          </CardContent>
        </Card>
      )}

      {sessionsQuery.data && sessionsQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Active sessions
              <Badge variant="default" className="ml-2">
                {sessionsQuery.data.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionsQuery.data.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/sessions/${s.id}`)}
                  >
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    <TableCell>{formatTimeAgo(s.startedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="default">{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost">
                        Open →
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NewSessionPanel({
  agents,
  loading,
  selectedAgentId,
  onSelect,
  onStart,
  pending,
  error,
}: {
  agents: Agent[];
  loading: boolean;
  selectedAgentId: string;
  onSelect: (v: string) => void;
  onStart: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Start a new session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm">Loading agents…</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agents yet — create one on the Agents page.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={selectedAgentId}
              onChange={(e) => onSelect(e.target.value)}
              className="flex-1 h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">— pick an agent —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button onClick={onStart} disabled={!selectedAgentId || pending}>
              {pending ? 'Starting…' : 'Start'}
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <Card className="animate-pulse">
      <CardContent className="pt-6">
        <div className="h-10 w-full bg-muted rounded mb-2" />
        <div className="h-10 w-full bg-muted rounded mb-2" />
      </CardContent>
    </Card>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="pt-6 flex items-center gap-4">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <div className="flex-1">
          <p className="font-medium">Failed to load sessions</p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
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
