'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign, Bot, Zap } from 'lucide-react';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

// Mock data - in production this would come from API
const costTrend = [
  { date: '2024-05-06', cost: 12.5 },
  { date: '2024-05-07', cost: 15.2 },
  { date: '2024-05-08', cost: 11.8 },
  { date: '2024-05-09', cost: 18.4 },
  { date: '2024-05-10', cost: 14.9 },
  { date: '2024-05-11', cost: 16.2 },
  { date: '2024-05-12', cost: 19.1 },
];

const tokenDistribution = [
  { name: 'Claude 3.5 Sonnet', value: 180000 },
  { name: 'GPT-4o', value: 95000 },
  { name: 'Gemini 1.5 Pro', value: 45000 },
  { name: 'Llama 3', value: 25000 },
];

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  trend?: number;
  icon: React.ElementType;
  color: string;
}

function MetricCard({ title, value, subtitle, trend, icon: Icon, color }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{subtitle}</p>
              {trend !== undefined && (
                <Badge variant={trend >= 0 ? 'default' : 'destructive'} className="text-xs">
                  {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  {Math.abs(trend)}%
                </Badge>
              )}
            </div>
          </div>
          <div className={`p-3 rounded-lg ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Agentic Control Tower</h1>
        <p className="text-muted-foreground">Monitor and manage your AI agents in real-time</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Today's Spend"
          value="$19.10"
          subtitle="320K tokens"
          trend={12}
          icon={DollarSign}
          color="bg-blue-500"
        />
        <MetricCard
          title="Active Sessions"
          value="3"
          subtitle="Running agents"
          icon={Activity}
          color="bg-green-500"
        />
        <MetricCard
          title="Requests Today"
          value="247"
          subtitle="Across all models"
          trend={8}
          icon={Zap}
          color="bg-purple-500"
        />
        <MetricCard
          title="Active Agents"
          value="5"
          subtitle="2 templates"
          icon={Bot}
          color="bg-orange-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Trend (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={costTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                  <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                  />
                  <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Token Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Token Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tokenDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                  >
                    {tokenDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number) => [value.toLocaleString(), 'Tokens']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-4 mt-4 justify-center">
              {tokenDistribution.map((item, index) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Agents & Budget */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Agents */}
        <Card>
          <CardHeader>
            <CardTitle>Top Agents by Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Code Assistant', requests: 150, cost: 2.5, tokens: 125000 },
                { name: 'Data Analyst', requests: 89, cost: 1.8, tokens: 89000 },
                { name: 'Research Assistant', requests: 67, cost: 1.2, tokens: 67000 },
              ].map((agent, index) => (
                <div key={agent.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-muted-foreground">#{index + 1}</span>
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-sm text-muted-foreground">{agent.requests} requests</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${agent.cost.toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">{agent.tokens.toLocaleString()} tokens</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Budget Status */}
        <Card>
          <CardHeader>
            <CardTitle>Budget Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { name: 'Daily Budget', current: 19.1, limit: 50, color: 'bg-green-500' },
              { name: 'Weekly Budget', current: 89.5, limit: 300, color: 'bg-yellow-500' },
              { name: 'Monthly Budget', current: 245.2, limit: 1000, color: 'bg-blue-500' },
            ].map((budget) => {
              const percentage = (budget.current / budget.limit) * 100;
              return (
                <div key={budget.name} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{budget.name}</span>
                    <span className="text-muted-foreground">
                      ${budget.current.toFixed(2)} / ${budget.limit}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={percentage} className="h-2" />
                    {percentage > 80 && (
                      <Badge variant="destructive" className="absolute -top-1 right-0 text-xs">
                        {percentage.toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}