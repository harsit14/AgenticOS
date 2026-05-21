'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { api, type TestProviderResult } from '@/lib/api';

type SettingsResponse = {
  default_model_id?: string;
  provider_api_keys?: Record<string, string>;
};

export default function ProvidersPage() {
  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: api.getProviders });
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: api.getModels });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings() as Promise<SettingsResponse>,
  });

  const [testResults, setTestResults] = React.useState<Record<string, TestProviderResult | 'pending'>>({});

  const testMutation = useMutation({
    mutationFn: (providerId: string) => api.testProvider(providerId),
    onMutate: (providerId) => {
      setTestResults((prev) => ({ ...prev, [providerId]: 'pending' }));
    },
    onSuccess: (data, providerId) => {
      setTestResults((prev) => ({ ...prev, [providerId]: data }));
    },
    onError: (err, providerId) => {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { ok: false, error: (err as Error).message },
      }));
    },
  });

  const configuredKeys = settingsQuery.data?.provider_api_keys ?? {};

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Providers</h1>
        <p className="text-muted-foreground">
          Configure API keys on the Settings page; test connections here.
        </p>
      </div>

      {providersQuery.isLoading && <ProvidersLoading />}
      {providersQuery.isError && (
        <ProvidersError
          message={(providersQuery.error as Error)?.message ?? 'Failed to load providers'}
          onRetry={() => providersQuery.refetch()}
        />
      )}

      {providersQuery.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providersQuery.data.map((p) => {
            const configured = !!configuredKeys[p.id];
            const test = testResults[p.id];
            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{p.displayName}</CardTitle>
                    <p className="text-xs text-muted-foreground">{p.baseUrl}</p>
                  </div>
                  {p.isLocal ? (
                    <Badge variant="secondary">Local</Badge>
                  ) : configured ? (
                    <Badge variant="default">Configured</Badge>
                  ) : (
                    <Badge variant="outline">Not configured</Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMutation.mutate(p.id)}
                    disabled={(!configured && !p.isLocal) || test === 'pending'}
                    className="w-full"
                  >
                    {test === 'pending' ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Testing…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Test connection
                      </>
                    )}
                  </Button>
                  {test && test !== 'pending' && (
                    <div
                      className={`flex items-start gap-2 text-sm rounded-md p-2 ${
                        test.ok
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {test.ok ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>
                            OK — {test.latencyMs}ms, {test.inputTokens ?? 0}+
                            {test.outputTokens ?? 0} tok
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <span className="break-words">{test.error}</span>
                        </>
                      )}
                    </div>
                  )}
                  {!configured && !p.isLocal && (
                    <Link
                      href="/settings"
                      className="text-sm text-muted-foreground inline-flex items-center hover:underline"
                    >
                      <SettingsIcon className="w-4 h-4 mr-1" />
                      Add API key on Settings →
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
        </CardHeader>
        <CardContent>
          {modelsQuery.isLoading && <p className="text-sm">Loading models…</p>}
          {modelsQuery.isError && (
            <p className="text-sm text-destructive">Failed to load models</p>
          )}
          {modelsQuery.data && modelsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No models registered.</p>
          )}
          {modelsQuery.data && modelsQuery.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Input $/M</TableHead>
                  <TableHead>Output $/M</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelsQuery.data.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.displayName}</TableCell>
                    <TableCell className="text-muted-foreground">{m.providerId}</TableCell>
                    <TableCell>{m.contextWindow.toLocaleString()}</TableCell>
                    <TableCell>${m.inputCostPer1M.toFixed(2)}</TableCell>
                    <TableCell>${m.outputCostPer1M.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProvidersLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-3 w-40 bg-muted rounded mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-8 w-full bg-muted rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProvidersError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="pt-6 flex items-center gap-4">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <div className="flex-1">
          <p className="font-medium">Failed to load providers</p>
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
