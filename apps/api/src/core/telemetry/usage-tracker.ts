import { db } from '../../db/index.js';
import { budgetAlerts, usageRecords, userStats } from '../../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface UsageMetrics {
  userId: string;
  agentId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface BudgetStatus {
  alertId: string;
  type: string;
  limitUsd: number;
  currentSpend: number;
  percentage: number;
  isTriggered: boolean;
}

// Usage tracker - records usage and checks budget alerts
export class UsageTracker {
  async recordUsage(metrics: UsageMetrics): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Update or create usage record
    const existing = await db.select().from(usageRecords)
      .where(sql`user_id = ${metrics.userId} AND agent_id = ${metrics.agentId} AND model_id = ${metrics.modelId} AND date = ${today}`)
      .get();

    if (existing) {
      const newRequestCount = existing.requestCount + 1;
      const newAvgLatency = ((existing.avgLatencyMs * existing.requestCount) + metrics.latencyMs) / newRequestCount;

      await db.update(usageRecords).set({
        inputTokens: existing.inputTokens + metrics.inputTokens,
        outputTokens: existing.outputTokens + metrics.outputTokens,
        totalTokens: existing.totalTokens + metrics.totalTokens,
        costUsd: existing.costUsd + metrics.costUsd,
        requestCount: newRequestCount,
        avgLatencyMs: newAvgLatency,
      }).where(eq(usageRecords.id, existing.id)).run();
    } else {
      await db.insert(usageRecords).values({
        id: nanoid(),
        userId: metrics.userId,
        agentId: metrics.agentId,
        modelId: metrics.modelId,
        date: today,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        totalTokens: metrics.totalTokens,
        costUsd: metrics.costUsd,
        requestCount: 1,
        avgLatencyMs: metrics.latencyMs,
        createdAt: new Date(),
      }).run();
    }

    // Check budget alerts
    await this.checkBudgetAlerts(metrics.userId, metrics.costUsd);

    // Update user stats for gamification
    await this.updateUserStats(metrics.userId, metrics.totalTokens, metrics.costUsd);
  }

  private async checkBudgetAlerts(userId: string, newCost: number): Promise<void> {
    const alerts = await db.select().from(budgetAlerts)
      .where(and(eq(budgetAlerts.userId, userId), eq(budgetAlerts.status, 'active')))
      .all();

    const today = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(today).getTime();
    const startOfWeek = new Date(today).getTime() - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(today).split('-').slice(0, 2).join('-') + '-01';

    for (const alert of alerts) {
      let currentSpend = 0;

      // Get usage for the relevant period
      const usage = await db.select().from(usageRecords)
        .where(and(
          eq(usageRecords.userId, userId),
          alert.type === 'daily' ? gte(sql`date`, today) : gte(sql`date`, startOfMonth)
        ))
        .all();

      currentSpend = usage.reduce((sum, u) => sum + u.costUsd, 0);

      // Update current spend
      await db.update(budgetAlerts).set({ currentSpend }).where(eq(budgetAlerts.id, alert.id)).run();

      // Check if triggered
      if (currentSpend >= alert.limitUsd && !alert.notifiedAt) {
        await db.update(budgetAlerts).set({
          status: 'triggered',
          notifiedAt: new Date(),
        }).where(eq(budgetAlerts.id, alert.id)).run();

        // In production, send notification (email, Slack, etc.)
        console.log(`[Budget Alert] User ${userId} exceeded ${alert.type} budget: $${currentSpend.toFixed(2)} / $${alert.limitUsd}`);
      }
    }
  }

  private async updateUserStats(userId: string, tokens: number, cost: number): Promise<void> {
    const existing = await db.select().from(userStats).where(eq(userStats.userId, userId)).get();

    if (existing) {
      await db.update(userStats).set({
        totalTokensSaved: existing.totalTokensSaved + Math.floor(tokens * 0.1), // Hypothetical savings
        totalCostSaved: existing.totalCostSaved + cost * 0.05, // Hypothetical savings
        updatedAt: new Date(),
      }).where(eq(userStats.userId, userId)).run();
    } else {
      await db.insert(userStats).values({
        id: nanoid(),
        userId,
        totalTokensSaved: Math.floor(tokens * 0.1),
        totalCostSaved: cost * 0.05,
        currentStreak: 1,
        longestStreak: 1,
        tasksCompleted: 1,
        badges: [],
        updatedAt: new Date(),
      }).run();
    }
  }

  async getBudgetStatus(userId: string): Promise<BudgetStatus[]> {
    const alerts = await db.select().from(budgetAlerts)
      .where(and(eq(budgetAlerts.userId, userId), eq(budgetAlerts.status, 'active')))
      .all();

    const statuses: BudgetStatus[] = [];

    for (const alert of alerts) {
      const today = new Date().toISOString().split('T')[0];
      const startOfMonth = today.split('-').slice(0, 2).join('-') + '-01';

      const usage = await db.select().from(usageRecords)
        .where(and(
          eq(usageRecords.userId, userId),
          gte(sql`date`, alert.type === 'monthly' ? startOfMonth : today)
        ))
        .all();

      const currentSpend = usage.reduce((sum, u) => sum + u.costUsd, 0);

      statuses.push({
        alertId: alert.id,
        type: alert.type,
        limitUsd: alert.limitUsd,
        currentSpend,
        percentage: (currentSpend / alert.limitUsd) * 100,
        isTriggered: currentSpend >= alert.limitUsd,
      });
    }

    return statuses;
  }

  async getUserStats(userId: string): Promise<{
    totalTokensSaved: number;
    totalCostSaved: number;
    currentStreak: number;
    longestStreak: number;
    tasksCompleted: number;
    badges: string[];
  } | null> {
    return db.select().from(userStats).where(eq(userStats.userId, userId)).get() as ReturnType<typeof this.getUserStats> extends Promise<infer T> ? T : never;
  }
}

// Budget alert manager
export class BudgetAlertManager {
  async createAlert(
    userId: string,
    type: 'daily' | 'weekly' | 'monthly' | 'threshold',
    limitUsd: number
  ): Promise<void> {
    const id = nanoid();
    const now = new Date();

    await db.insert(budgetAlerts).values({
      id,
      userId,
      type,
      limitUsd,
      currentSpend: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  async updateAlert(alertId: string, limitUsd: number): Promise<void> {
    await db.update(budgetAlerts).set({
      limitUsd,
      updatedAt: new Date(),
    }).where(eq(budgetAlerts.id, alertId)).run();
  }

  async deleteAlert(alertId: string): Promise<void> {
    await db.delete(budgetAlerts).where(eq(budgetAlerts.id, alertId)).run();
  }

  async getAlerts(userId: string): Promise<BudgetStatus[]> {
    const tracker = new UsageTracker();
    return tracker.getBudgetStatus(userId);
  }

  async resetAlert(alertId: string): Promise<void> {
    await db.update(budgetAlerts).set({
      status: 'active',
      currentSpend: 0,
      notifiedAt: null,
      updatedAt: new Date(),
    }).where(eq(budgetAlerts.id, alertId)).run();
  }
}

// Singleton instances
let usageTracker: UsageTracker | null = null;
let budgetAlertManager: BudgetAlertManager | null = null;

export function getUsageTracker(): UsageTracker {
  if (!usageTracker) {
    usageTracker = new UsageTracker();
  }
  return usageTracker;
}

export function getBudgetAlertManager(): BudgetAlertManager {
  if (!budgetAlertManager) {
    budgetAlertManager = new BudgetAlertManager();
  }
  return budgetAlertManager;
}