'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, MessageSquare, Clock, DollarSign, RefreshCw, Send } from 'lucide-react';

// Mock live sessions
const liveSessions = [
  { id: '1', agent: 'Code Assistant', user: 'user_123', startedAt: '2 min ago', messages: 12, tokens: 2450, cost: 0.12, status: 'active' },
  { id: '2', agent: 'Data Analyst', user: 'user_456', startedAt: '5 min ago', messages: 8, tokens: 1890, cost: 0.08, status: 'active' },
  { id: '3', agent: 'Research Assistant', user: 'user_789', startedAt: '12 min ago', messages: 23, tokens: 4520, cost: 0.22, status: 'active' },
];

// Mock messages for the selected session
const mockMessages = [
  { role: 'user', content: 'Can you help me write a function to calculate fibonacci numbers?', timestamp: '10:45 AM' },
  { role: 'assistant', content: 'Of course! Here\'s a recursive implementation:\n\n```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n```\n\nThis has O(2^n) time complexity. For better performance, you might want to use memoization.', timestamp: '10:45 AM' },
  { role: 'user', content: 'Can you optimize it using dynamic programming?', timestamp: '10:46 AM' },
  { role: 'assistant', content: 'Here\'s an optimized version using dynamic programming with O(n) time and O(n) space:\n\n```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    dp = [0] * (n + 1)\n    dp[1] = 1\n    for i in range(2, n + 1):\n        dp[i] = dp[i-1] + dp[i-2]\n    return dp[n]\n```\n\nOr with O(1) space:\n\n```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    a, b = 0, 1\n    for _ in range(n - 1):\n        a, b = b, a + b\n    return b\n```', timestamp: '10:46 AM' },
];

export default function MonitorPage() {
  const [selectedSession, setSelectedSession] = React.useState(liveSessions[0]);
  const [messageInput, setMessageInput] = React.useState('');
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingContent, setStreamingContent] = React.useState('');

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;

    // Simulate streaming response
    setIsStreaming(true);
    setStreamingContent('');

    const responseText = 'I\'m processing your request. This is a simulated streaming response to demonstrate the live monitoring capabilities of the Agentic Control Tower.';
    let index = 0;

    const streamInterval = setInterval(() => {
      if (index < responseText.length) {
        setStreamingContent(prev => prev + responseText[index]);
        index++;
      } else {
        clearInterval(streamInterval);
        setIsStreaming(false);
        setStreamingContent('');
        setMessageInput('');
      }
    }, 30);
  };

  return (
    <div className="p-8 h-[calc(100vh-4rem)] flex gap-8">
      {/* Left Panel - Live Sessions */}
      <div className="w-1/3 flex flex-col gap-4">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg">Live Sessions</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                <Activity className="w-3 h-3 mr-1" />
                {liveSessions.length} Active
              </Badge>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-2">
              {liveSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedSession.id === session.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{session.agent}</span>
                    <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                      {session.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {session.startedAt}
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {session.messages} msgs
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {session.tokens.toLocaleString()} tokens
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      ${session.cost.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Session Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Session Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{selectedSession.messages}</p>
                <p className="text-xs text-muted-foreground">Messages</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{selectedSession.tokens.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Tokens</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">${selectedSession.cost.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Cost</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{selectedSession.startedAt}</p>
                <p className="text-xs text-muted-foreground">Duration</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Chat */}
      <div className="flex-1 flex flex-col gap-4">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Session: {selectedSession.agent}</CardTitle>
              <Badge variant="outline">{selectedSession.id}</Badge>
            </div>
            {isStreaming && (
              <Badge variant="default" className="animate-pulse">
                Streaming...
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-auto space-y-4">
            {mockMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs opacity-70">{msg.role}</span>
                    <span className="text-xs opacity-50">{msg.timestamp}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {/* Streaming message */}
            {isStreaming && streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[70%] rounded-lg p-4 bg-muted">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs opacity-70">assistant</span>
                    <span className="text-xs opacity-50 animate-pulse">streaming...</span>
                  </div>
                  <p className="whitespace-pre-wrap">{streamingContent}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message Input */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="Type your message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isStreaming}
                className="flex-1"
              />
              <Button onClick={handleSendMessage} disabled={isStreaming || !messageInput.trim()}>
                <Send className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}