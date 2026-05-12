import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bot, Settings, Copy, Trash2, Play, Plus } from 'lucide-react';

// Mock agents data
const mockAgents = [
  { id: '1', name: 'Code Assistant', description: 'Write, review, and debug code', model: 'Claude 3.5 Sonnet', status: 'active', sessions: 45, tokens: 125000, cost: 38.5 },
  { id: '2', name: 'Data Analyst', description: 'Analyze data and generate insights', model: 'GPT-4o', status: 'active', sessions: 32, tokens: 89000, cost: 28.2 },
  { id: '3', name: 'Research Assistant', description: 'Research and summarize information', model: 'Gemini 1.5 Pro', status: 'active', sessions: 28, tokens: 67000, cost: 18.5 },
  { id: '4', name: 'Customer Support', description: 'Handle customer inquiries', model: 'Claude 3.5 Haiku', status: 'inactive', sessions: 15, tokens: 34000, cost: 8.2 },
];

export default function AgentsPage() {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-muted-foreground">Create and manage your AI agents</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create Agent
        </Button>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockAgents.map((agent) => (
          <Card key={agent.id} className="flex flex-col">
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="w-5 h-5" />
                  {agent.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{agent.description}</p>
              </div>
              <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
                {agent.status}
              </Badge>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Model</span>
                  <Badge variant="outline">{agent.model}</Badge>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-2 rounded bg-muted">
                    <p className="text-lg font-bold">{agent.sessions}</p>
                    <p className="text-xs text-muted-foreground">Sessions</p>
                  </div>
                  <div className="p-2 rounded bg-muted">
                    <p className="text-lg font-bold">{(agent.tokens / 1000).toFixed(0)}K</p>
                    <p className="text-xs text-muted-foreground">Tokens</p>
                  </div>
                  <div className="p-2 rounded bg-muted">
                    <p className="text-lg font-bold">${agent.cost}</p>
                    <p className="text-xs text-muted-foreground">Cost</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" size="sm">
                    <Settings className="w-4 h-4 mr-1" />
                    Configure
                  </Button>
                  <Button variant="outline" className="flex-1" size="sm">
                    <Play className="w-4 h-4 mr-1" />
                    Test
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1">
                    <Copy className="w-4 h-4 mr-1" />
                    Clone
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Code Assistant</TableCell>
                <TableCell>2 min ago</TableCell>
                <TableCell>12 min</TableCell>
                <TableCell>8</TableCell>
                <TableCell>2,450</TableCell>
                <TableCell>$0.12</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Data Analyst</TableCell>
                <TableCell>15 min ago</TableCell>
                <TableCell>8 min</TableCell>
                <TableCell>12</TableCell>
                <TableCell>3,200</TableCell>
                <TableCell>$0.18</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Research Assistant</TableCell>
                <TableCell>1 hour ago</TableCell>
                <TableCell>25 min</TableCell>
                <TableCell>15</TableCell>
                <TableCell>5,600</TableCell>
                <TableCell>$0.28</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}