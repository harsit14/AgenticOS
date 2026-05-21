'use client';

import * as React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, AlertCircle, Send, StopCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ContextVisualizer } from '@/components/context-visualizer';
import { countTokens, type Message } from '@agentic-os/types';

export default function SessionDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  // Streaming state. pendingUser shows the user's message optimistically while
  // a turn is in flight; streamingText accumulates the live assistant reply.
  const [pendingUser, setPendingUser] = React.useState<string | null>(null);
  const [streamingText, setStreamingText] = React.useState<string | null>(null);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamError, setStreamError] = React.useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id),
    enabled: !!id,
  });

  const messagesQuery = useQuery({
    queryKey: ['session', id, 'messages'],
    queryFn: () => api.getMessages(id),
    enabled: !!id,
  });

  const agentQuery = useQuery({
    queryKey: ['agent', sessionQuery.data?.agentId],
    queryFn: () => api.getAgent(sessionQuery.data!.agentId),
    enabled: !!sessionQuery.data?.agentId,
  });

  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: api.getModels });
  const model = modelsQuery.data?.find((m) => m.id === sessionQuery.data?.modelId);

  // Blocking send — used for tool-enabled agents (the tool loop can't stream).
  const sendMutation = useMutation({
    mutationFn: (content: string) => api.sendMessage(id, { content }),
    onSettled: () => {
      setPendingUser(null);
      queryClient.invalidateQueries({ queryKey: ['session', id, 'messages'] });
    },
  });

  const endMutation = useMutation({
    mutationFn: () => api.endSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
      queryClient.invalidateQueries({ queryKey: ['sessions', { status: 'active' }] });
    },
  });

  const busy = sendMutation.isPending || isStreaming;

  // Auto-scroll to bottom as messages or streamed tokens arrive.
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data?.length, streamingText, pendingUser]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    setStreamError(null);
    setDraft('');
    setPendingUser(text);

    // Tool-enabled agents run the agentic loop, which can't stream — fall back
    // to the blocking endpoint. Plain chat agents stream token-by-token.
    const agentHasTools = (agentQuery.data?.tools?.length ?? 0) > 0;
    if (agentHasTools) {
      sendMutation.mutate(text);
      return;
    }

    setIsStreaming(true);
    setStreamingText('');
    await api.streamMessage(id, text, {
      onDelta: (chunk) => setStreamingText((prev) => (prev ?? '') + chunk),
      onDone: () => {
        setIsStreaming(false);
        setStreamingText(null);
        setPendingUser(null);
        queryClient.invalidateQueries({ queryKey: ['session', id, 'messages'] });
      },
      onError: (message) => {
        setIsStreaming(false);
        setStreamingText(null);
        setPendingUser(null);
        setStreamError(message);
        queryClient.invalidateQueries({ queryKey: ['session', id, 'messages'] });
      },
    });
  }

  if (!id) return null;

  if (sessionQuery.isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="p-8">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-destructive" />
            {(sessionQuery.error as Error).message}
          </CardContent>
        </Card>
      </div>
    );
  }

  const session = sessionQuery.data!;
  const messages = messagesQuery.data ?? [];
  const isActive = session.status === 'active';

  // Token accounting for the visualizer.
  const systemPromptTokens = agentQuery.data?.persona?.systemPrompt
    ? countTokens(agentQuery.data.persona.systemPrompt)
    : 0;
  const historyTokens = messages.reduce((sum, m) => sum + (m.tokenCount ?? 0), 0);
  const totalCost = messages.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/monitor"
          className="text-sm text-muted-foreground inline-flex items-center hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to monitor
        </Link>
        {isActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => endMutation.mutate()}
            disabled={endMutation.isPending}
            className="text-destructive hover:text-destructive"
          >
            <StopCircle className="w-4 h-4 mr-1" />
            End session
          </Button>
        )}
      </div>

      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {session.agent?.name ?? 'Session'}
          </h1>
          <p className="text-xs text-muted-foreground font-mono">{session.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isActive ? 'default' : 'secondary'}>{session.status}</Badge>
          <Badge variant="outline">{model?.displayName ?? session.modelId}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card className="flex flex-col h-[calc(100vh-280px)]">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {messagesQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading messages…</p>
            )}
            {messagesQuery.isError && (
              <p className="text-sm text-destructive">
                {(messagesQuery.error as Error).message}
              </p>
            )}
            {messagesQuery.data && messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No messages yet. Say hello below.
              </p>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {pendingUser && <PlainBubble role="user" content={pendingUser} />}
            {streamingText !== null && (
              <PlainBubble role="assistant" content={streamingText} streaming />
            )}
            {sendMutation.isPending && (
              <div className="text-sm text-muted-foreground italic">
                Assistant is thinking…
              </div>
            )}
            {(streamError || sendMutation.isError) && (
              <div className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {streamError ??
                  (sendMutation.error instanceof ApiError
                    ? sendMutation.error.message
                    : (sendMutation.error as Error)?.message)}
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>
          <form onSubmit={handleSend} className="border-t p-3 flex gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={isActive ? 'Type a message…' : 'Session ended.'}
              disabled={!isActive || busy}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend(e as unknown as React.FormEvent);
                }
              }}
            />
            <Button type="submit" disabled={!isActive || !draft.trim() || busy}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          {model && (
            <ContextVisualizer
              contextWindow={model.contextWindow}
              systemPromptTokens={systemPromptTokens}
              toolsTokens={0}
              historyTokens={historyTokens}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Messages" value={messages.length.toString()} />
              <Row label="Tokens" value={historyTokens.toLocaleString()} />
              <Row label="Cost" value={`$${totalCost.toFixed(4)}`} />
              <Row label="Started" value={new Date(session.startedAt).toLocaleString()} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 space-y-1 ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        {(message.tokenCount || message.costUsd || message.latencyMs) && (
          <div className="flex gap-2 text-xs opacity-70 pt-1">
            {message.tokenCount ? <span>{message.tokenCount} tok</span> : null}
            {message.latencyMs ? <span>· {message.latencyMs}ms</span> : null}
            {message.costUsd ? <span>· ${message.costUsd.toFixed(5)}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

// Lightweight bubble for optimistic / streaming content (no metadata footer).
function PlainBubble({
  role,
  content,
  streaming,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm">
          {content}
          {streaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 bg-current animate-pulse" />
          )}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
