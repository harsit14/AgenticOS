'use client';

import * as React from 'react';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Model, Provider } from '@agentic-os/types';

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = React.useState<Step>(1);
  const [chosenProviderIds, setChosenProviderIds] = React.useState<Set<string>>(new Set());
  const [defaultModelId, setDefaultModelId] = React.useState('');

  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: api.getProviders });
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: api.getModels });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings() as Promise<{ provider_api_keys?: Record<string, string> }>,
  });

  const configuredKeys = settingsQuery.data?.provider_api_keys ?? {};

  const finishMutation = useMutation({
    mutationFn: (modelId: string) => api.setSetting('default_model_id', modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      router.push('/');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-2xl space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-3xl font-bold">Welcome to Agentic OS</h1>
          <p className="text-muted-foreground">
            Three quick steps to get your first agent running locally.
          </p>
          <StepIndicator current={step} />
        </header>

        {step === 1 && (
          <StepPickProviders
            providers={providersQuery.data ?? []}
            loading={providersQuery.isLoading}
            chosen={chosenProviderIds}
            onToggle={(id) => {
              const next = new Set(chosenProviderIds);
              next.has(id) ? next.delete(id) : next.add(id);
              setChosenProviderIds(next);
            }}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <StepEnterKeys
            providers={(providersQuery.data ?? []).filter((p) => chosenProviderIds.has(p.id))}
            configuredKeys={configuredKeys}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <StepPickModel
            providers={providersQuery.data ?? []}
            models={modelsQuery.data ?? []}
            chosenProviderIds={chosenProviderIds}
            selected={defaultModelId}
            onSelect={setDefaultModelId}
            onBack={() => setStep(2)}
            onFinish={() => finishMutation.mutate(defaultModelId)}
            pending={finishMutation.isPending}
            error={finishMutation.isError ? (finishMutation.error as Error).message : null}
          />
        )}
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`h-1 w-12 rounded-full ${
            n <= current ? 'bg-primary' : 'bg-muted'
          }`}
        />
      ))}
    </div>
  );
}

function StepPickProviders({
  providers,
  loading,
  chosen,
  onToggle,
  onNext,
}: {
  providers: Provider[];
  loading: boolean;
  chosen: Set<string>;
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Pick the providers you want to use</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading providers…</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {providers.map((p) => {
            const selected = chosen.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggle(p.id)}
                className={`text-left rounded-md border p-3 transition-colors ${
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.displayName}</span>
                  {p.isLocal && <Badge variant="secondary">Local</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.baseUrl}</p>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={onNext} disabled={chosen.size === 0}>
            Continue
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepEnterKeys({
  providers,
  configuredKeys,
  onBack,
  onNext,
}: {
  providers: Provider[];
  configuredKeys: Record<string, string>;
  onBack: () => void;
  onNext: () => void;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      api.setSetting('provider_api_keys', payload),
    onSuccess: () => {
      setSaving(null);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => setSaving(null),
  });

  const cloud = providers.filter((p) => !p.isLocal);
  const local = providers.filter((p) => p.isLocal);

  const allCloudReady = cloud.every((p) => !!configuredKeys[p.id]);
  const canContinue = providers.length === 0 || allCloudReady || local.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Add API keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {cloud.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You picked only local providers — no keys needed.
          </p>
        ) : (
          cloud.map((p) => {
            const configured = !!configuredKeys[p.id];
            const draft = drafts[p.id] ?? '';
            return (
              <div key={p.id} className="space-y-2 border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`onboarding-key-${p.id}`}>{p.displayName}</Label>
                  {configured ? (
                    <span className="text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Saved
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id={`onboarding-key-${p.id}`}
                    type="password"
                    placeholder={configured ? '••••••• (saved)' : 'sk-…'}
                    value={draft}
                    onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!draft) return;
                      setSaving(p.id);
                      mutation.mutate({ [p.id]: draft });
                      setDrafts({ ...drafts, [p.id]: '' });
                    }}
                    disabled={!draft || saving === p.id}
                  >
                    {saving === p.id ? 'Saving…' : 'Save'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Keys are stored locally in your SQLite database.
                </p>
              </div>
            );
          })
        )}
        {local.length > 0 && (
          <p className="text-xs text-muted-foreground">
            For Ollama / LM Studio: make sure the local server is running on
            its default port before you continue.
          </p>
        )}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext} disabled={!canContinue}>
            Continue
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepPickModel({
  providers,
  models,
  chosenProviderIds,
  selected,
  onSelect,
  onBack,
  onFinish,
  pending,
  error,
}: {
  providers: Provider[];
  models: Model[];
  chosenProviderIds: Set<string>;
  selected: string;
  onSelect: (v: string) => void;
  onBack: () => void;
  onFinish: () => void;
  pending: boolean;
  error: string | null;
}) {
  const queryClient = useQueryClient();
  const chosenProviders = providers.filter((p) => chosenProviderIds.has(p.id));
  const localChosen = chosenProviders.filter((p) => p.isLocal);
  const cloudCandidates = models.filter(
    (m) => chosenProviderIds.has(m.providerId) && !providers.find((p) => p.id === m.providerId)?.isLocal,
  );
  const registeredLocal = models.filter((m) =>
    localChosen.some((p) => p.id === m.providerId),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Pick a default model</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {localChosen.map((p) => (
          <LocalProviderSection
            key={p.id}
            provider={p}
            registered={registeredLocal.filter((m) => m.providerId === p.id)}
            onRegistered={() => queryClient.invalidateQueries({ queryKey: ['models'] })}
          />
        ))}

        {cloudCandidates.length === 0 && registeredLocal.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No models available yet. For local providers, discover and register a
            model above; for cloud, go back and add a key.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">Choose default</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[...cloudCandidates, ...registeredLocal].map((m) => {
                const isSelected = selected === m.id;
                const isLocal = !!providers.find((p) => p.id === m.providerId)?.isLocal;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelect(m.id)}
                    className={`text-left rounded-md border p-3 transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.displayName}</span>
                      <Badge variant="outline" className="text-xs">
                        {(m.contextWindow / 1000).toFixed(0)}K ctx
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isLocal
                        ? 'Local — no per-token cost'
                        : `$${m.inputCostPer1M.toFixed(2)}/M input · $${m.outputCostPer1M.toFixed(2)}/M output`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onFinish} disabled={!selected || pending}>
            {pending ? 'Finishing…' : 'Finish setup'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LocalProviderSection({
  provider,
  registered,
  onRegistered,
}: {
  provider: Provider;
  registered: Model[];
  onRegistered: () => void;
}) {
  const discoverMutation = useMutation({
    mutationFn: () => api.discoverLocalModels(provider.id),
  });
  const registerMutation = useMutation({
    mutationFn: (name: string) => api.registerLocalModel(provider.id, { name }),
    onSuccess: () => onRegistered(),
  });

  const discovered = discoverMutation.data?.models ?? [];
  const registeredNames = new Set(registered.map((m) => m.name));

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{provider.displayName}</p>
          <p className="text-xs text-muted-foreground">{provider.baseUrl}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => discoverMutation.mutate()}
          disabled={discoverMutation.isPending}
        >
          {discoverMutation.isPending ? 'Probing…' : 'Discover models'}
        </Button>
      </div>

      {discoverMutation.data && !discoverMutation.data.ok && (
        <p className="text-sm text-destructive">
          {discoverMutation.data.error ?? 'Discovery failed'}
        </p>
      )}

      {discoverMutation.isError && (
        <p className="text-sm text-destructive">
          {discoverMutation.error instanceof ApiError
            ? discoverMutation.error.message
            : (discoverMutation.error as Error).message}
        </p>
      )}

      {discovered.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Loaded in {provider.displayName}:
          </p>
          <ul className="space-y-1">
            {discovered.map((m) => {
              const isRegistered = registeredNames.has(m.id);
              return (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{m.id}</span>
                  {isRegistered ? (
                    <Badge variant="secondary" className="text-xs">
                      Registered
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => registerMutation.mutate(m.id)}
                      disabled={registerMutation.isPending}
                    >
                      Register
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {discovered.length === 0 &&
        !discoverMutation.isPending &&
        !discoverMutation.data && (
          <p className="text-xs text-muted-foreground">
            Click <strong>Discover models</strong> to fetch the list from{' '}
            {provider.displayName}. Make sure it&apos;s running on{' '}
            <code className="font-mono">{provider.baseUrl}</code>.
          </p>
        )}
    </div>
  );
}
