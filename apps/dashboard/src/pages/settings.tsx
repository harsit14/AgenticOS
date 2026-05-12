import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getToolRegistry } from '@/lib/tools-api';

// This would be server-side in a real app
async function getTools() {
  return [
    { id: 'calculator', name: 'Calculator', description: 'Perform mathematical calculations', category: 'data', requiresApproval: false },
    { id: 'web_search', name: 'Web Search', description: 'Search the web for information', category: 'web', requiresApproval: false },
    { id: 'code_interpreter', name: 'Code Interpreter', description: 'Execute code in a sandboxed environment', category: 'code', requiresApproval: true },
    { id: 'http_request', name: 'HTTP Request', description: 'Make HTTP requests to external APIs', category: 'api', requiresApproval: true },
    { id: 'file_read', name: 'File Read', description: 'Read contents of a file', category: 'file', requiresApproval: true },
    { id: 'file_write', name: 'File Write', description: 'Write content to a file', category: 'file', requiresApproval: true },
  ];
}

async function getPersonaPresets() {
  return [
    { id: 'professional', name: 'Professional', tone: 'professional', description: 'Business-focused, concise, action-oriented' },
    { id: 'casual', name: 'Casual', tone: 'casual', description: 'Friendly, warm, approachable' },
    { id: 'technical', name: 'Technical', tone: 'technical', description: 'Detailed, precise, code-focused' },
    { id: 'creative', name: 'Creative', tone: 'creative', description: 'Imaginative, brainstorming, outside-the-box' },
  ];
}

async function getMemoryStrategies() {
  return [
    { id: 'sliding_window', name: 'Sliding Window', description: 'Keeps most recent N messages. Simple and effective.', defaultMaxMessages: 50 },
    { id: 'summary', name: 'Summary', description: 'Summarizes conversation periodically. Better for long threads.', defaultMaxMessages: 20 },
    { id: 'full', name: 'Full Context', description: 'Keeps all messages. Best for short conversations.', defaultMaxMessages: 100 },
  ];
}

export default async function SettingsPage() {
  const [tools, personaPresets, memoryStrategies] = await Promise.all([
    getTools(),
    getPersonaPresets(),
    getMemoryStrategies(),
  ]);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Agent Configuration</h1>
        <p className="text-muted-foreground">Customize agent personas, tools, and memory settings</p>
      </div>

      {/* Persona Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Persona Presets</CardTitle>
          <CardDescription>Choose a starting point for your agent&apos;s personality</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {personaPresets.map((preset) => (
              <div key={preset.id} className="border rounded-lg p-4 space-y-2 hover:border-primary/50 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{preset.name}</h3>
                  <Badge variant="outline">{preset.tone}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{preset.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Memory Strategies */}
      <Card>
        <CardHeader>
          <CardTitle>Memory Strategies</CardTitle>
          <CardDescription>How the agent manages conversation context</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {memoryStrategies.map((strategy) => (
              <div key={strategy.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{strategy.name}</h3>
                  <Badge variant="secondary">{strategy.defaultMaxMessages} messages</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{strategy.description}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Context Window Usage</span>
                    <span>~{strategy.defaultMaxMessages * 20} tokens</span>
                  </div>
                  <Progress value={strategy.defaultMaxMessages} max={200} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Available Tools */}
      <Card>
        <CardHeader>
          <CardTitle>Available Tools</CardTitle>
          <CardDescription>Tools your agents can use to extend their capabilities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <div key={tool.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{tool.name}</h3>
                  {tool.requiresApproval && (
                    <Badge variant="destructive">Requires Approval</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
                <Badge variant="secondary" className="mt-2">{tool.category}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agent Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start Templates</CardTitle>
          <CardDescription>Pre-configured agents for common use cases</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: 'Code Assistant', description: 'Write, review, and debug code', category: 'development', icon: '💻' },
              { name: 'Data Analyst', description: 'Analyze data and generate insights', category: 'analytics', icon: '📊' },
              { name: 'Customer Support', description: 'Handle customer inquiries', category: 'support', icon: '🎧' },
              { name: 'Research Assistant', description: 'Research and summarize information', category: 'research', icon: '🔍' },
              { name: 'Creative Writer', description: 'Write and brainstorm content', category: 'writing', icon: '✍️' },
            ].map((template) => (
              <div key={template.name} className="border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer">
                <div className="text-2xl mb-2">{template.icon}</div>
                <h3 className="font-medium">{template.name}</h3>
                <p className="text-sm text-muted-foreground">{template.description}</p>
                <Badge variant="outline" className="mt-2">{template.category}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}