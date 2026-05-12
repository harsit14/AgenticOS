import { FastifyInstance } from 'fastify';
import { getGamificationService, BADGE_DEFINITIONS } from '../core/orchestration/gamification.js';

export async function gamificationRoutes(fastify: FastifyInstance) {
  const gamification = getGamificationService();

  // Get user stats
  fastify.get<{ Params: { userId: string } }>('/gamification/:userId/stats', async (request, reply) => {
    const { userId } = request.params;

    try {
      const stats = await gamification.getUserStats(userId);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' },
      });
    }
  });

  // Get leaderboard
  fastify.get('/gamification/leaderboard', async (request, reply) => {
    const { limit = 10 } = request.query as { limit?: number };

    try {
      const leaderboard = await gamification.getLeaderboard(limit);

      return {
        success: true,
        data: leaderboard,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get leaderboard' },
      });
    }
  });

  // Get cost comparison
  fastify.get<{ Params: { userId: string } }>('/gamification/:userId/comparison', async (request, reply) => {
    const { userId } = request.params;
    const { days = 7 } = request.query as { days?: number };

    try {
      const comparison = await gamification.getCostComparison(userId, days);

      return {
        success: true,
        data: comparison,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get comparison' },
      });
    }
  });

  // Get all badges
  fastify.get('/gamification/badges', async (request, reply) => {
    const { type, tier } = request.query as { type?: string; tier?: string };

    let badges = BADGE_DEFINITIONS;

    if (type) {
      badges = badges.filter(b => b.criteria.type === type);
    }

    if (tier) {
      badges = badges.filter(b => b.tier === tier);
    }

    return {
      success: true,
      data: badges,
    };
  });

  // Get user badges
  fastify.get<{ Params: { userId: string } }>('/gamification/:userId/badges', async (request, reply) => {
    const { userId } = request.params;

    try {
      const stats = await gamification.getUserStats(userId);
      const earnedBadges = stats.badges.map(id => gamification.getBadgeDefinition(id)).filter(Boolean);
      const availableBadges = gamification.getAvailableBadges(stats.badges);

      return {
        success: true,
        data: {
          earned: earnedBadges,
          available: availableBadges,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get badges' },
      });
    }
  });

  // Record activity (update streak)
  fastify.post<{ Params: { userId: string } }>('/gamification/:userId/activity', async (request, reply) => {
    const { userId } = request.params;

    try {
      await gamification.updateStreak(userId);
      const stats = await gamification.getUserStats(userId);

      return {
        success: true,
        data: {
          streakUpdated: true,
          currentStreak: stats.currentStreak,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to record activity' },
      });
    }
  });

  // Record task completion
  fastify.post<{ Params: { userId: string } }>('/gamification/:userId/complete-task', async (request, reply) => {
    const { userId } = request.params;

    try {
      await gamification.recordTaskCompletion(userId);
      const stats = await gamification.getUserStats(userId);
      const newBadges = await gamification.checkAndAwardBadges(userId);

      return {
        success: true,
        data: {
          tasksCompleted: stats.tasksCompleted,
          newBadges,
          level: stats.level,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to record completion' },
      });
    }
  });

  // Record savings
  fastify.post<{ Params: { userId: string } }>('/gamification/:userId/record-savings', async (request, reply) => {
    const { userId } = request.params;
    const { tokensSaved = 0, costSaved = 0 } = request.body as { tokensSaved?: number; costSaved?: number };

    try {
      await gamification.recordSavings(userId, tokensSaved, costSaved);
      const stats = await gamification.getUserStats(userId);
      const newBadges = await gamification.checkAndAwardBadges(userId);

      return {
        success: true,
        data: {
          totalTokensSaved: stats.totalTokensSaved,
          totalCostSaved: stats.totalCostSaved,
          newBadges,
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to record savings' },
      });
    }
  });
}