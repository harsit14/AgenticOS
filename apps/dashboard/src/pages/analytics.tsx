'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Bot, Zap, Clock, Award, Target } from 'lucide-react';

// Mock analytics data
const weeklyTrend = [
  { day: 'Mon', requests: 45, cost: 8.5, tokens: 45000 },
  { day: 'Tue', requests: 52, cost: 10.2, tokens: 52000 },
  { day: 'Wed', requests: 38, cost: 7.8, tokens: 38000 },
  { day: 'Thu', requests: 61, cost: 12.1, tokens: 61000 },
  { day: 'Fri', requests: 55, cost: 11.5, tokens: 55000 },
  { day: 'Sat', requests: 28, cost: 5.2, tokens: 28000 },
  { day: 'Sun', requests: 33, cost: 6.8, tokens: 33000 },
];

const modelUsage = [
  { model: 'Claude 3.5 Sonnet', requests: 120, tokens: 156000, cost: 45.6 },
  { model: 'GPT-4o', requests: 85, tokens: 89000, cost: 32.1 },
  { model: 'Gemini 1.5 Pro', requests: 45, tokens: 67000, cost: 18.5 },
  { model: 'Llama 3 (Local)', requests: 62, tokens: 48000, cost: 0 },
];

const agentPerformance = [
  { name: 'Code Assistant', success: 94, avgLatency: 1200, costPerRequest: 0.12 },
  { name: 'Data Analyst', success: 91, avgLatency: 1500, costPerRequest: 0.15 },
  { name: 'Research Assistant', success: 88, avgLatency: 2000, costPerRequest: 0.22 },
  { name: 'Customer Support', success: 96, avgLatency: 800, costPerRequest: 0.08 },
];

export default function AnalyticsPage() {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Usage insights and performance metrics</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Spend (30d)</p>
                <p className="text-2xl font-bold">$312.50</p>
                <div className="flex items-center gap-1 text-xs text-green-500">
                  <TrendingUp className="w-3 h-3" />
                  12% vs last month
                </div>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <DollarSign className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">3,847</p>
                <div className="flex items-center gap-1 text-xs text-green-500">
                  <TrendingUp className="w-3 h-3" />
                  8% vs last month
                </div>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Zap className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Avg Latency</p>
                <p className="text-2xl font-bold">1.4s</p>
                <div className="flex items-center gap-1 text-xs text-red-500">
                  <TrendingDown className="w-3 h-3" />
                  5% slower
                </div>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/10">
                <Clock className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">92.3%</p>
                <div className="flex items-center gap-1 text-xs text-green-500">
                  <TrendingUp className="w-3 h-3" />
                  2% improvement
                </div>
              </div>
              <div className="p-3 rounded-lg bg-orange-500/10">
                <Target className="w-6 h-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Request & Cost Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" className="text-xs fill-muted-foreground" />
                  <YAxis yAxisId="left" className="text-xs fill-muted-foreground" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Area yAxisId="left" type="monotone" dataKey="requests" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                  <Area yAxisId="right" type="monotone" dataKey="cost" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Model Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelUsage} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs fill-muted-foreground" />
                  <YAxis dataKey="model" type="category" width={120} className="text-xs fill-muted-foreground" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="requests" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {agentPerformance.map((agent) => (
              <div key={agent.name} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{agent.name}</h3>
                  <Bot className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Success Rate</span>
                      <span>{agent.success}%</span>
                    </div>
                    <Progress value={agent.success} className="h-2" />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Latency</span>
                    <span>{(agent.avgLatency / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cost/Request</span>
                    <span>${agent.costPerRequest.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gamification Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-500" />
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Token Saver', description: 'Saved 10K tokens this week', earned: true, icon: '💰' },
                { name: 'Cost Cutter', description: 'Reduced costs by 15%', earned: true, icon: '✂️' },
                { name: 'Streak Master', description: '7-day usage streak', earned: false, icon: '🔥' },
              ].map((badge) => (
                <div key={badge.name} className={`flex items-center gap-4 p-3 rounded-lg ${badge.earned ? 'bg-yellow-500/10' : 'bg-muted opacity-50'}`}>
                  <span className="text-2xl">{badge.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium">{badge.name}</p>
                    <p className="text-sm text-muted-foreground">{badge.description}</p>
                  </div>
                  {badge.earned && <Badge variant="default">Earned</Badge>}
                  {!badge.earned && <Badge variant="outline">Locked</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              Efficiency Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tokens Saved (Optimization)</span>
                <span className="font-bold">24,500</span>
              </div>
              <Progress value={65} className="h-2" />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Cost Avoided</span>
                <span className="font-bold text-green-500">$156.80</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Avg Response Quality</span>
                <span className="font-bold">4.2/5.0</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-500" />
              Current Streak
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="py-8">
              <p className="text-6xl font-bold text-primary">5</p>
              <p className="text-muted-foreground mt-2">Day Streak</p>
              <p className="text-sm text-muted-foreground mt-4">Use an agent today to continue your streak!</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}