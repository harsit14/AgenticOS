'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, RefreshCw, Save } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Model, Provider } from '@agentic-os/types';

type SettingsResponse = {
  default_model_id?: string;
  monthly_budget_usd?: number;
  provider_api_keys?: Record<string, string>;
  ui_preferences?: { theme: 'light' | 'dark' | 'system' };
};

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings() as Promise<SettingsResponse>,
  });
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: api.getModels });
  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: api.getProviders });

  if (settingsQuery.isLoading) {
    return (
      <div className="p-8">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 w-40 bg-muted rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-4 w-2/3 bg-muted rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="p-8">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-center gap-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <div className="flex-1">
              <p className="font-medium">Failed to load settings</p>
              <p className="text-sm text-muted-foreground">
                {(settingsQuery.error as Error)?.message}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => settingsQuery.refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const settings = settingsQuery.data ?? {};

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your local Agentic OS instance.</p>
      </div>

      <DefaultModelSection
        currentModelId={settings.default_model_id ?? ''}
        models={modelsQuery.data ?? []}
        modelsLoading={modelsQuery.isLoading}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['settings'] })}
      />

      <MonthlyBudgetSection
        currentBudget={settings.monthly_budget_usd ?? 0}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['settings'] })}
      />

      <ProviderKeysSection
        providers={providersQuery.data ?? []}
        configuredKeys={settings.provider_api_keys ?? {}}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['settings'] })}
      />
    </div>
  );
}

function DefaultModelSection({
  currentModelId,
  models,
  modelsLoading,
  onSaved,
}: {
  currentModelId: string;
  models: Model[];
  modelsLoading: boolean;
  onSaved: () => void;
}) {
  const [selected, setSelected] = React.useState(currentModelId);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => setSelected(currentModelId), [currentModelId]);

  const mutation = useMutation({
    mutationFn: (value: string) => api.setSetting('default_model_id', value),
    onSuccess: () => {
      setStatus('Saved');
      onSaved();
      setTimeout(() => setStatus(null), 2000);
    },
    onError: (err: unknown) => {
      setStatus(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default model</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Used when an agent or session doesn&apos;t specify its own model.
        </p>
        {modelsLoading ? (
          <p className="text-sm">Loading models…</p>
        ) : (
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">— none —</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => mutation.mutate(selected)}
            disabled={mutation.isPending || !selected || selected === currentModelId}
          >
            <Save className="w-4 h-4 mr-2" />
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyBudgetSection({
  currentBudget,
  onSaved,
}: {
  currentBudget: number;
  onSaved: () => void;
}) {
  const [value, setValue] = React.useState(String(currentBudget));
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => setValue(String(currentBudget)), [currentBudget]);

  const mutation = useMutation({
    mutationFn: (n: number) => api.setSetting('monthly_budget_usd', n),
    onSuccess: () => {
      setStatus('Saved');
      onSaved();
      setTimeout(() => setStatus(null), 2000);
    },
    onError: (err: unknown) => {
      setStatus(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly budget</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Soft cap in USD. Used for the budget alert on the analytics page.
        </p>
        <div className="flex items-center gap-2 max-w-xs">
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              const n = Number(value);
              if (Number.isFinite(n) && n >= 0) mutation.mutate(n);
            }}
            disabled={mutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderKeysSection({
  providers,
  configuredKeys,
  onSaved,
}: {
  providers: Provider[];
  configuredKeys: Record<string, string>;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (next: Record<string, string>) =>
      api.setSetting('provider_api_keys', next),
    onSuccess: () => {
      setStatus('Saved');
      setDrafts({});
      onSaved();
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setTimeout(() => setStatus(null), 2000);
    },
    onError: (err: unknown) => {
      setStatus(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  function saveOne(providerId: string) {
    const draft = drafts[providerId];
    if (!draft) return;
    mutation.mutate({ [providerId]: draft });
  }

  function clearOne(providerId: string) {
    mutation.mutate({ [providerId]: '' });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider API keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Keys are stored in the local SQLite database and never leave your machine.
          To rotate a key, paste a new one and click Save.
        </p>
        <div className="space-y-3">
          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground">No providers registered.</p>
          )}
          {providers.map((p) => {
            const configured = !!configuredKeys[p.id];
            const draftValue = drafts[p.id];
            return (
              <div key={p.id} className="flex flex-col gap-2 border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{p.displayName}</p>
                    <p className="text-xs text-muted-foreground">{p.baseUrl}</p>
                  </div>
                  {p.isLocal ? (
                    <Badge variant="secondary">Local</Badge>
                  ) : configured ? (
                    <Badge variant="default">Configured</Badge>
                  ) : (
                    <Badge variant="outline">Not configured</Badge>
                  )}
                </div>
                {!p.isLocal && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`key-${p.id}`} className="sr-only">
                      {p.displayName} API key
                    </Label>
                    <Input
                      id={`key-${p.id}`}
                      type="password"
                      placeholder={configured ? '••••••• (saved)' : 'sk-…'}
                      value={draftValue ?? ''}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [p.id]: e.target.value })
                      }
                    />
                    <Button
                      size="sm"
                      onClick={() => saveOne(p.id)}
                      disabled={!draftValue || mutation.isPending}
                    >
                      Save
                    </Button>
                    {configured && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => clearOne(p.id)}
                        disabled={mutation.isPending}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}
