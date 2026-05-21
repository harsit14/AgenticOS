import { db } from '../../db/index.js';
import { budgetAlerts, usageRecords } from '../../db/schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface UsageMetrics {
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

    const existing = await db
      .select()
      .from(usageRecords)
      .where(
        sql`agent_id = ${metrics.agentId} AND model_id = ${metrics.modelId} AND date = ${today}`
      )
      .get();

    if (existing) {
      const newRequestCount = existing.requestCount + 1;
      const newAvgLatency =
        (existing.avgLatencyMs * existing.requestCount + metrics.latencyMs) / newRequestCount;

      await db
        .update(usageRecords)
        .set({
          inputTokens: existing.inputTokens + metrics.inputTokens,
          outputTokens: existing.outputTokens + metrics.outputTokens,
          totalTokens: existing.totalTokens + metrics.totalTokens,
          costUsd: existing.costUsd + metrics.costUsd,
          requestCount: newRequestCount,
          avgLatencyMs: newAvgLatency,
        })
        .where(eq(usageRecords.id, existing.id))
        .run();
    } else {
      await db
        .insert(usageRecords)
        .values({
          id: nanoid(),
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
        })
        .run();
    }

    await this.checkBudgetAlerts();
  }

  private async checkBudgetAlerts(): Promise<void> {
    const alerts = await db
      .select()
      .from(budgetAlerts)
      .where(eq(budgetAlerts.status, 'active'))
      .all();

    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = today.split('-').slice(0, 2).join('-') + '-01';

    for (const alert of alerts) {
      const usage = await db
        .select()
        .from(usageRecords)
        .where(alert.type === 'daily' ? gte(sql`date`, today) : gte(sql`date`, startOfMonth))
        .all();

      const currentSpend = usage.reduce((sum, u) => sum + u.costUsd, 0);

      await db
        .update(budgetAlerts)
        .set({ currentSpend })
        .where(eq(budgetAlerts.id, alert.id))
        .run();

      if (currentSpend >= alert.limitUsd && !alert.notifiedAt) {
        await db
          .update(budgetAlerts)
          .set({
            status: 'triggered',
            notifiedAt: new Date(),
          })
          .where(eq(budgetAlerts.id, alert.id))
          .run();

        console.log(
          `[Budget Alert] Exceeded ${alert.type} budget: $${currentSpend.toFixed(2)} / $${alert.limitUsd}`
        );
      }
    }
  }

  async getBudgetStatus(): Promise<BudgetStatus[]> {
    const alerts = await db
      .select()
      .from(budgetAlerts)
      .where(eq(budgetAlerts.status, 'active'))
      .all();

    const statuses: BudgetStatus[] = [];
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = today.split('-').slice(0, 2).join('-') + '-01';

    for (const alert of alerts) {
      const usage = await db
        .select()
        .from(usageRecords)
        .where(gte(sql`date`, alert.type === 'monthly' ? startOfMonth : today))
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
}

// Budget alert manager
export class BudgetAlertManager {
  async createAlert(
    type: 'daily' | 'weekly' | 'monthly' | 'threshold',
    limitUsd: number
  ): Promise<void> {
    const id = nanoid();
    const now = new Date();

    await db
      .insert(budgetAlerts)
      .values({
        id,
        type,
        limitUsd,
        currentSpend: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  async updateAlert(alertId: string, limitUsd: number): Promise<void> {
    await db
      .update(budgetAlerts)
      .set({
        limitUsd,
        updatedAt: new Date(),
      })
      .where(eq(budgetAlerts.id, alertId))
      .run();
  }

  async deleteAlert(alertId: string): Promise<void> {
    await db.delete(budgetAlerts).where(eq(budgetAlerts.id, alertId)).run();
  }

  async getAlerts(): Promise<BudgetStatus[]> {
    const tracker = new UsageTracker();
    return tracker.getBudgetStatus();
  }

  async resetAlert(alertId: string): Promise<void> {
    await db
      .update(budgetAlerts)
      .set({
        status: 'active',
        currentSpend: 0,
        notifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(budgetAlerts.id, alertId))
      .run();
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
