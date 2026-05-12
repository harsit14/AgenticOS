'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Check, X, Settings, RefreshCw, Plus } from 'lucide-react';

// Mock provider data
const providers = [
  { id: 'anthropic', name: 'Anthropic', displayName: 'Anthropic', models: 4, status: 'active', configured: true },
  { id: 'openai', name: 'OpenAI', displayName: 'OpenAI', models: 4, status: 'active', configured: true },
  { id: 'vertex', name: 'vertex', displayName: 'Google Vertex AI', models: 3, status: 'active', configured: true },
  { id: 'bedrock', name: 'bedrock', displayName: 'AWS Bedrock', models: 3, status: 'inactive', configured: false },
  { id: 'ollama', name: 'ollama', displayName: 'Ollama (Local)', models: 4, status: 'active', configured: true },
  { id: 'lmstudio', name: 'lmstudio', displayName: 'LM Studio (Local)', models: 2, status: 'active', configured: true },
  { id: 'groq', name: 'groq', displayName: 'Groq', models: 2, status: 'active', configured: true },
  { id: 'mistral', name: 'mistral', displayName: 'Mistral AI', models: 3, status: 'inactive', configured: false },
];

// Mock model data
const models = [
  { id: 'claude-3-5-sonnet', provider: 'Anthropic', name: 'Claude 3.5 Sonnet', contextWindow: '200K', inputCost: 3, outputCost: 15, status: 'active', capabilities: ['streaming', 'vision', 'function_calling'] },
  { id: 'claude-3-5-haiku', provider: 'Anthropic', name: 'Claude 3.5 Haiku', contextWindow: '200K', inputCost: 0.8, outputCost: 4, status: 'active', capabilities: ['streaming', 'vision', 'function_calling'] },
  { id: 'gpt-4o', provider: 'OpenAI', name: 'GPT-4o', contextWindow: '128K', inputCost: 5, outputCost: 15, status: 'active', capabilities: ['streaming', 'vision', 'function_calling'] },
  { id: 'gpt-4o-mini', provider: 'OpenAI', name: 'GPT-4o Mini', contextWindow: '128K', inputCost: 0.15, outputCost: 0.6, status: 'active', capabilities: ['streaming', 'vision', 'function_calling'] },
  { id: 'gemini-1.5-pro', provider: 'Vertex AI', name: 'Gemini 1.5 Pro', contextWindow: '1M', inputCost: 1.25, outputCost: 5, status: 'active', capabilities: ['streaming', 'vision', 'function_calling'] },
  { id: 'gemini-1.5-flash', provider: 'Vertex AI', name: 'Gemini 1.5 Flash', contextWindow: '1M', inputCost: 0.075, outputCost: 0.3, status: 'active', capabilities: ['streaming', 'vision', 'function_calling'] },
  { id: 'llama3', provider: 'Ollama', name: 'Llama 3', contextWindow: '8K', inputCost: 0, outputCost: 0, status: 'active', capabilities: ['streaming'] },
  { id: 'codellama', provider: 'Ollama', name: 'Code Llama', contextWindow: '8K', inputCost: 0, outputCost: 0, status: 'beta', capabilities: ['streaming'] },
];

export default function ProvidersPage() {
  const [selectedProvider, setSelectedProvider] = React.useState(providers[0]);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Providers & Models</h1>
          <p className="text-muted-foreground">Manage LLM providers and model configurations</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Provider
        </Button>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {providers.map((provider) => (
          <Card
            key={provider.id}
            className={`cursor-pointer transition-colors ${
              selectedProvider.id === provider.id ? 'border-primary' : ''
            }`}
            onClick={() => setSelectedProvider(provider)}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{provider.displayName}</h3>
                {provider.configured ? (
                  <Badge variant="default" className="text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <X className="w-3 h-3 mr-1" />
                    Not Set
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">{provider.models} models</p>
              <div className="flex items-center justify-between">
                <Badge variant={provider.status === 'active' ? 'default' : 'secondary'}>
                  {provider.status}
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Model Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Model Catalog</CardTitle>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Models
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Context Window</TableHead>
                <TableHead>Input ($/M)</TableHead>
                <TableHead>Output ($/M)</TableHead>
                <TableHead>Capabilities</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="font-medium">{model.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{model.provider}</Badge>
                  </TableCell>
                  <TableCell>{model.contextWindow}</TableCell>
                  <TableCell>${model.inputCost}</TableCell>
                  <TableCell>${model.outputCost}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {model.capabilities.map((cap) => (
                        <Badge key={cap} variant="secondary" className="text-xs">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={model.status === 'active' ? 'default' : 'secondary'}>
                      {model.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Selected Provider Details */}
      <Card>
        <CardHeader>
          <CardTitle>Provider: {selectedProvider.displayName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 rounded-lg bg-muted">
                <span className="text-muted-foreground">API Endpoint</span>
                <span className="font-mono text-sm">{selectedProvider.id === 'ollama' ? 'http://localhost:11434' : 'https://api...'}</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-lg bg-muted">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={selectedProvider.status === 'active' ? 'default' : 'secondary'}>
                  {selectedProvider.status}
                </Badge>
              </div>
              <div className="flex justify-between items-center p-4 rounded-lg bg-muted">
                <span className="text-muted-foreground">Models Available</span>
                <span className="font-bold">{selectedProvider.models}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg border space-y-2">
                <h4 className="font-medium">Rate Limits</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requests/min</span>
                  <span>50</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tokens/min</span>
                  <span>100,000</span>
                </div>
              </div>
              <div className="p-4 rounded-lg border space-y-2">
                <h4 className="font-medium">Usage This Month</h4>
                <Progress value={45} className="h-2" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">45% of limit</span>
                  <span>$45.60</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}