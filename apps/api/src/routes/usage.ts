import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { usageRecords, sessions } from '../db/schema.js';
import { eq, gte } from 'drizzle-orm';
import { InvalidInputError } from '../core/errors.js';

type GroupBy = 'day' | 'model' | 'agent';

function parseRangeDays(range: string | undefined): number {
  if (!range) return 7;
  const m = range.match(/^(\d+)d$/);
  if (!m) throw new InvalidInputError(`Invalid range: ${range} (expected like "7d")`);
  const days = Number(m[1]);
  if (days <= 0 || days > 365) throw new InvalidInputError(`range out of bounds: ${range}`);
  return days;
}

function dateKeyDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export async function usageRouter(app: FastifyInstance) {
  // GET /api/usage/aggregate?groupBy=day|model|agent&range=7d
  app.get<{
    Querystring: { groupBy?: GroupBy; range?: string };
  }>('/aggregate', async (request) => {
    const groupBy = (request.query.groupBy ?? 'day') as GroupBy;
    if (!['day', 'model', 'agent'].includes(groupBy)) {
      throw new InvalidInputError(`groupBy must be day|model|agent`);
    }
    const days = parseRangeDays(request.query.range);
    const start = dateKeyDaysAgo(days - 1);

    // Only pull rows in the requested window (date is a sortable YYYY-MM-DD key).
    const inRange = await db
      .select()
      .from(usageRecords)
      .where(gte(usageRecords.date, start))
      .all();

    if (groupBy === 'day') {
      const byDay = new Map<string, { date: string; cost: number; tokens: number; requests: number }>();
      // Pre-seed every day in the window so the chart has zero rows for days with no activity.
      for (let i = days - 1; i >= 0; i--) {
        const d = dateKeyDaysAgo(i);
        byDay.set(d, { date: d, cost: 0, tokens: 0, requests: 0 });
      }
      for (const r of inRange) {
        const slot = byDay.get(r.date);
        if (!slot) continue;
        slot.cost += r.costUsd;
        slot.tokens += r.totalTokens;
        slot.requests += r.requestCount;
      }
      return {
        success: true,
        data: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      };
    }

    const keyField: 'modelId' | 'agentId' = groupBy === 'model' ? 'modelId' : 'agentId';
    const grouped = new Map<string, { id: string; cost: number; tokens: number; requests: number }>();
    for (const r of inRange) {
      const id = r[keyField];
      const slot = grouped.get(id) ?? { id, cost: 0, tokens: 0, requests: 0 };
      slot.cost += r.costUsd;
      slot.tokens += r.totalTokens;
      slot.requests += r.requestCount;
      grouped.set(id, slot);
    }
    return {
      success: true,
      data: Array.from(grouped.values()).sort((a, b) => b.cost - a.cost),
    };
  });

  // GET /api/usage/summary — KPI cards on the dashboard home
  app.get('/summary', async () => {
    const today = dateKeyDaysAgo(0);
    const weekAgo = dateKeyDaysAgo(6);
    const monthAgo = dateKeyDaysAgo(29);

    // The widest window we need is the last 30 days — scope the query to it.
    const recent = await db
      .select()
      .from(usageRecords)
      .where(gte(usageRecords.date, monthAgo))
      .all();

    const totals = (start: string) =>
      recent
        .filter((r) => r.date >= start)
        .reduce(
          (acc, r) => ({
            cost: acc.cost + r.costUsd,
            tokens: acc.tokens + r.totalTokens,
            requests: acc.requests + r.requestCount,
          }),
          { cost: 0, tokens: 0, requests: 0 },
        );

    const allSessions = await db.select().from(sessions).where(eq(sessions.status, 'active')).all();

    return {
      success: true,
      data: {
        today: totals(today),
        week: totals(weekAgo),
        month: totals(monthAgo),
        activeSessions: allSessions.length,
      },
    };
  });
}
