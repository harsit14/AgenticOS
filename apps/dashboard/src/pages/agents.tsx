'use client';

// PATTERN: This page is the template for all other dashboard pages.
// 1. useQuery for reads with loading/error/empty states
// 2. useMutation for writes that invalidate the matching query key
// 3. No mock data. No local state for server data.

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, Plus, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { CreateAgentModal } from '@/components/create-agent-modal';
import type { Agent, Model } from '@agentic-os/types';

function modelDisplayName(modelId: string, models: Model[] | undefined): string {
  const found = models?.find((m) => m.id === modelId);
  return found?.displayName ?? modelId;
}

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);

  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: api.getAgents,
  });

  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: api.getModels,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  function handleDelete(agent: Agent) {
    if (confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(agent.id);
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-muted-foreground">Create and manage your AI agents</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Agent
        </Button>
      </div>

      {agentsQuery.isLoading && <AgentsLoading />}

      {agentsQuery.isError && (
        <AgentsError
          message={
            agentsQuery.error instanceof ApiError
              ? agentsQuery.error.message
              : (agentsQuery.error as Error)?.message ?? 'Failed to load agents'
          }
          onRetry={() => agentsQuery.refetch()}
        />
      )}

      {agentsQuery.data && agentsQuery.data.length === 0 && (
        <AgentsEmpty onCreate={() => setCreateOpen(true)} />
      )}

      {agentsQuery.data && agentsQuery.data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agentsQuery.data.map((agent) => (
            <Card key={agent.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bot className="w-5 h-5" />
                    {agent.name}
                  </CardTitle>
                  {agent.description && (
                    <p className="text-sm text-muted-foreground">{agent.description}</p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Model</span>
                  <Badge variant="outline">
                    {modelDisplayName(agent.defaultModelId, modelsQuery.data)}
                  </Badge>
                </div>

                {agent.tags && agent.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground line-clamp-3">
                  {agent.persona?.systemPrompt}
                </p>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(agent)}
                    disabled={deleteMutation.isPending && deleteMutation.variables === agent.id}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateAgentModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function AgentsLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-3 w-48 bg-muted rounded mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-3/4 bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AgentsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="pt-6 flex items-center gap-4">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <div className="flex-1">
          <p className="font-medium">Failed to load agents</p>
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

function AgentsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="pt-12 pb-12 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Bot className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">No agents yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first agent to start a conversation.
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Create your first agent
        </Button>
      </CardContent>
    </Card>
  );
}
