'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';

interface CreateAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAgentModal({ open, onOpenChange }: CreateAgentModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [systemPrompt, setSystemPrompt] = React.useState('You are a helpful AI assistant.');
  const [modelId, setModelId] = React.useState('');
  const [selectedTools, setSelectedTools] = React.useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: api.getModels,
    enabled: open,
  });

  const toolsQuery = useQuery({
    queryKey: ['tools'],
    queryFn: api.getTools,
    enabled: open,
  });

  // Default-select the first model once models load.
  React.useEffect(() => {
    if (!modelId && modelsQuery.data && modelsQuery.data.length > 0) {
      setModelId(modelsQuery.data[0].id);
    }
  }, [modelsQuery.data, modelId]);

  const selectedModel = modelsQuery.data?.find((m) => m.id === modelId);
  const modelSupportsTools = selectedModel?.supportsFunctionCalling ?? false;

  const createMutation = useMutation({
    mutationFn: api.createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onOpenChange(false);
      setName('');
      setDescription('');
      setSystemPrompt('You are a helpful AI assistant.');
      setSelectedTools(new Set());
      setSubmitError(null);
    },
    onError: (err: unknown) => {
      setSubmitError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  function toggleTool(toolId: string) {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      next.has(toolId) ? next.delete(toolId) : next.add(toolId);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!name.trim()) {
      setSubmitError('Name is required');
      return;
    }
    if (!modelId) {
      setSubmitError('Pick a default model');
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      defaultModelId: modelId,
      // Only send tools the model can actually call.
      tools: modelSupportsTools ? Array.from(selectedTools) : [],
      persona: {
        tone: 'professional',
        systemPrompt: systemPrompt.trim() || 'You are a helpful AI assistant.',
        temperature: 0.7,
        maxTokens: 4096,
        knowledgeBases: [],
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create agent</DialogTitle>
            <DialogDescription>
              Configure a new agent. You can edit everything except the model later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Code assistant"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-description">Description</Label>
            <Input
              id="agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Helps me write and review code"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-system-prompt">System prompt</Label>
            <Textarea
              id="agent-system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-model">Default model</Label>
            {modelsQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading models…</p>
            )}
            {modelsQuery.isError && (
              <p className="text-sm text-destructive">Failed to load models.</p>
            )}
            {modelsQuery.data && (
              <select
                id="agent-model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                {modelsQuery.data.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tools</Label>
            {!modelSupportsTools ? (
              <p className="text-sm text-muted-foreground">
                {selectedModel
                  ? `${selectedModel.displayName} doesn't support function calling — tools are disabled for this model.`
                  : 'Pick a model to choose tools.'}
              </p>
            ) : toolsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading tools…</p>
            ) : toolsQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load tools.</p>
            ) : toolsQuery.data && toolsQuery.data.length > 0 ? (
              <div className="space-y-1 max-h-44 overflow-y-auto rounded-md border p-2">
                {toolsQuery.data.map((tool) => (
                  <label
                    key={tool.id}
                    className="flex items-start gap-2 rounded p-1.5 hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedTools.has(tool.id)}
                      onChange={() => toggleTool(tool.id)}
                    />
                    <span className="text-sm">
                      <span className="font-medium">{tool.name}</span>
                      {tool.requiresApproval && (
                        <span className="ml-1 text-xs text-amber-600 dark:text-amber-500">
                          (needs approval)
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {tool.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tools available.</p>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
