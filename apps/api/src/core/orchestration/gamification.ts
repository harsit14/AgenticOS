import { db } from '../../db/index.js';
import { userStats, usageRecords, agents } from '../../db/schema.js';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

// Badge definitions
export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  criteria: {
    type: 'tokens_saved' | 'cost_reduction' | 'streak' | 'tasks_completed' | 'agents_created' | 'pipelines_created';
    threshold: number;
    comparison?: 'gte' | 'eq' | 'lt';
  };
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Token Saving Badges
  {
    id: 'token-saver-bronze',
    name: 'Token Saver',
    description: 'Saved 10,000 tokens',
    icon: 'leaf',
    criteria: { type: 'tokens_saved', threshold: 10000, comparison: 'gte' },
    tier: 'bronze',
  },
  {
    id: 'token-saver-silver',
    name: 'Token Saver',
    description: 'Saved 100,000 tokens',
    icon: 'leaf',
    criteria: { type: 'tokens_saved', threshold: 100000, comparison: 'gte' },
    tier: 'silver',
  },
  {
    id: 'token-saver-gold',
    name: 'Token Saver',
    description: 'Saved 1,000,000 tokens',
    icon: 'leaf',
    criteria: { type: 'tokens_saved', threshold: 1000000, comparison: 'gte' },
    tier: 'gold',
  },

  // Cost Reduction Badges
  {
    id: 'cost-cutter-bronze',
    name: 'Cost Cutter',
    description: 'Saved $1 in API costs',
    icon: 'piggy-bank',
    criteria: { type: 'cost_reduction', threshold: 1, comparison: 'gte' },
    tier: 'bronze',
  },
  {
    id: 'cost-cutter-silver',
    name: 'Cost Cutter',
    description: 'Saved $10 in API costs',
    icon: 'piggy-bank',
    criteria: { type: 'cost_reduction', threshold: 10, comparison: 'gte' },
    tier: 'silver',
  },
  {
    id: 'cost-cutter-gold',
    name: 'Cost Cutter',
    description: 'Saved $100 in API costs',
    icon: 'piggy-bank',
    criteria: { type: 'cost_reduction', threshold: 100, comparison: 'gte' },
    tier: 'gold',
  },

  // Streak Badges
  {
    id: 'streak-3',
    name: 'Getting Started',
    description: '3 day usage streak',
    icon: 'flame',
    criteria: { type: 'streak', threshold: 3, comparison: 'gte' },
    tier: 'bronze',
  },
  {
    id: 'streak-7',
    name: 'Week Warrior',
    description: '7 day usage streak',
    icon: 'flame',
    criteria: { type: 'streak', threshold: 7, comparison: 'gte' },
    tier: 'silver',
  },
  {
    id: 'streak-30',
    name: 'Month Master',
    description: '30 day usage streak',
    icon: 'flame',
    criteria: { type: 'streak', threshold: 30, comparison: 'gte' },
    tier: 'gold',
  },

  // Tasks Completed Badges
  {
    id: 'tasks-10',
    name: 'Task Tackler',
    description: 'Completed 10 tasks',
    icon: 'check-circle',
    criteria: { type: 'tasks_completed', threshold: 10, comparison: 'gte' },
    tier: 'bronze',
  },
  {
    id: 'tasks-100',
    name: 'Task Tackler',
    description: 'Completed 100 tasks',
    icon: 'check-circle',
    criteria: { type: 'tasks_completed', threshold: 100, comparison: 'gte' },
    tier: 'silver',
  },
  {
    id: 'tasks-1000',
    name: 'Task Tackler',
    description: 'Completed 1,000 tasks',
    icon: 'check-circle',
    criteria: { type: 'tasks_completed', threshold: 1000, comparison: 'gte' },
    tier: 'gold',
  },

  // Agent Creation Badges
  {
    id: 'creator-bronze',
    name: 'Agent Creator',
    description: 'Created your first agent',
    icon: 'bot',
    criteria: { type: 'agents_created', threshold: 1, comparison: 'gte' },
    tier: 'bronze',
  },
  {
    id: 'creator-silver',
    name: 'Agent Creator',
    description: 'Created 5 agents',
    icon: 'bot',
    criteria: { type: 'agents_created', threshold: 5, comparison: 'gte' },
    tier: 'silver',
  },
  {
    id: 'creator-gold',
    name: 'Agent Creator',
    description: 'Created 20 agents',
    icon: 'bot',
    criteria: { type: 'agents_created', threshold: 20, comparison: 'gte' },
    tier: 'gold',
  },
];

export interface UserGamificationStats {
  totalTokensSaved: number;
  totalCostSaved: number;
  currentStreak: number;
  longestStreak: number;
  tasksCompleted: number;
  badges: string[];
  recentBadges: string[];
  level: number;
  points: number;
  rank: string;
}

export interface LeaderboardEntry {
  userId: string;
  rank: number;
  totalTokensSaved: number;
  totalCostSaved: number;
  tasksCompleted: number;
  currentStreak: number;
  badges: string[];
  level: number;
}

export class GamificationService {
  // Get or create user stats
  async getUserStats(userId: string): Promise<UserGamificationStats> {
    let stats = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);

    if (stats.length === 0) {
      const now = new Date();
      await db.insert(userStats).values({
        id: `stats-${userId}`,
        userId,
        totalTokensSaved: 0,
        totalCostSaved: 0,
        currentStreak: 0,
        longestStreak: 0,
        tasksCompleted: 0,
        badges: '[]',
        updatedAt: now,
      });
      stats = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
    }

    const s = stats[0];
    const badges = JSON.parse(s.badges as string) as string[];
    const level = this.calculateLevel(s.totalCostSaved, s.tasksCompleted);
    const points = this.calculatePoints(s.totalCostSaved, s.tasksCompleted, badges.length);

    return {
      totalTokensSaved: s.totalTokensSaved,
      totalCostSaved: s.totalCostSaved,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      tasksCompleted: s.tasksCompleted,
      badges,
      recentBadges: badges.slice(-5),
      level,
      points,
      rank: this.getRank(level),
    };
  }

  // Update streak on user activity
  async updateStreak(userId: string): Promise<void> {
    const stats = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
    if (!stats.length) return;

    const lastActive = stats[0].updatedAt;
    const now = new Date();
    const daysSinceLastActive = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

    let newStreak = stats[0].currentStreak;

    if (daysSinceLastActive === 1) {
      // Consecutive day - increment streak
      newStreak = stats[0].currentStreak + 1;
    } else if (daysSinceLastActive > 1) {
      // Streak broken - reset to 1
      newStreak = 1;
    }

    const longestStreak = Math.max(stats[0].longestStreak, newStreak);

    await db.update(userStats).set({
      currentStreak: newStreak,
      longestStreak,
      updatedAt: now,
    }).where(eq(userStats.userId, userId)).run();

    // Check for new streak badges
    await this.checkAndAwardBadges(userId);
  }

  // Record cost savings
  async recordSavings(userId: string, tokensSaved: number, costSaved: number): Promise<void> {
    const stats = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
    if (!stats.length) return;

    await db.update(userStats).set({
      totalTokensSaved: stats[0].totalTokensSaved + tokensSaved,
      totalCostSaved: stats[0].totalCostSaved + costSaved,
      updatedAt: new Date(),
    }).where(eq(userStats.userId, userId)).run();

    // Check for new badges
    await this.checkAndAwardBadges(userId);
  }

  // Record task completion
  async recordTaskCompletion(userId: string): Promise<void> {
    const stats = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
    if (!stats.length) return;

    await db.update(userStats).set({
      tasksCompleted: stats[0].tasksCompleted + 1,
      updatedAt: new Date(),
    }).where(eq(userStats.userId, userId)).run();

    // Check for new badges
    await this.checkAndAwardBadges(userId);
  }

  // Get cost comparison (before vs after optimization)
  async getCostComparison(userId: string, days = 7): Promise<{
    baseline: number;
    actual: number;
    saved: number;
    percentSaved: number;
  }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const records = await db
      .select()
      .from(usageRecords)
      .where(and(
        eq(usageRecords.userId, userId),
        gte(usageRecords.date, cutoff.toISOString().split('T')[0])
      ));

    const actualCost = records.reduce((sum, r) => sum + r.costUsd, 0);

    // Estimate baseline (assuming 20% less efficient without optimization)
    const baseline = actualCost * 1.25;
    const saved = baseline - actualCost;
    const percentSaved = baseline > 0 ? (saved / baseline) * 100 : 0;

    return {
      baseline,
      actual: actualCost,
      saved,
      percentSaved,
    };
  }

  // Get leaderboard
  async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const allStats = await db
      .select()
      .from(userStats)
      .orderBy(desc(userStats.totalCostSaved));

    return allStats.slice(0, limit).map((stats, index) => ({
      userId: stats.userId,
      rank: index + 1,
      totalTokensSaved: stats.totalTokensSaved,
      totalCostSaved: stats.totalCostSaved,
      tasksCompleted: stats.tasksCompleted,
      currentStreak: stats.currentStreak,
      badges: JSON.parse(stats.badges as string) as string[],
      level: this.calculateLevel(stats.totalCostSaved, stats.tasksCompleted),
    }));
  }

  // Check and award badges
  async checkAndAwardBadges(userId: string): Promise<string[]> {
    const stats = await this.getUserStats(userId);
    const currentBadges = new Set(stats.badges);
    const newBadges: string[] = [];

    for (const badge of BADGE_DEFINITIONS) {
      if (currentBadges.has(badge.id)) continue;

      let earned = false;
      const value = this.getStatValue(stats, badge.criteria.type);

      switch (badge.criteria.comparison) {
        case 'gte':
          earned = value >= badge.criteria.threshold;
          break;
        case 'lt':
          earned = value < badge.criteria.threshold;
          break;
        case 'eq':
          earned = value === badge.criteria.threshold;
          break;
        default:
          earned = value >= badge.criteria.threshold;
      }

      if (earned) {
        currentBadges.add(badge.id);
        newBadges.push(badge.id);
      }
    }

    if (newBadges.length > 0) {
      await db.update(userStats).set({
        badges: JSON.stringify(Array.from(currentBadges)),
        updatedAt: new Date(),
      }).where(eq(userStats.userId, userId)).run();
    }

    return newBadges;
  }

  private getStatValue(stats: UserGamificationStats, type: BadgeDefinition['criteria']['type']): number {
    switch (type) {
      case 'tokens_saved':
        return stats.totalTokensSaved;
      case 'cost_reduction':
        return stats.totalCostSaved;
      case 'streak':
        return stats.currentStreak;
      case 'tasks_completed':
        return stats.tasksCompleted;
      default:
        return 0;
    }
  }

  private calculateLevel(totalCostSaved: number, tasksCompleted: number): number {
    const points = this.calculatePoints(totalCostSaved, tasksCompleted, 0);
    // Level formula: every 100 points = 1 level
    return Math.floor(points / 100) + 1;
  }

  private calculatePoints(totalCostSaved: number, tasksCompleted: number, badgeCount: number): number {
    // 1 point per $0.01 saved
    // 1 point per task completed
    // 5 points per badge earned
    return Math.floor(totalCostSaved * 100) + tasksCompleted + (badgeCount * 5);
  }

  private getRank(level: number): string {
    if (level >= 50) return 'Legend';
    if (level >= 40) return 'Master';
    if (level >= 30) return 'Expert';
    if (level >= 20) return 'Advanced';
    if (level >= 10) return 'Intermediate';
    return 'Beginner';
  }

  // Get available (unearned) badges
  getAvailableBadges(earnedBadgeIds: string[]): BadgeDefinition[] {
    return BADGE_DEFINITIONS.filter(b => !earnedBadgeIds.includes(b.id));
  }

  // Get badge definition by ID
  getBadgeDefinition(badgeId: string): BadgeDefinition | undefined {
    return BADGE_DEFINITIONS.find(b => b.id === badgeId);
  }
}

// Singleton
let gamificationService: GamificationService | null = null;

export function getGamificationService(): GamificationService {
  if (!gamificationService) {
    gamificationService = new GamificationService();
  }
  return gamificationService;
}