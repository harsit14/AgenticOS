import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMetricsSnapshot, recordRequest, recordError } from '../telemetry/index.js';
import { getUsageTracker, getBudgetAlertManager } from '../core/telemetry/usage-tracker.js';

// Prometheus metrics endpoint
export async function metricsRouter(app: FastifyInstance) {
  // Prometheus metrics endpoint
  app.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = getMetricsSnapshot();

    // Generate Prometheus-formatted metrics
    const output = [
      '# HELP agentic_requests_total Total number of requests',
      '# TYPE agentic_requests_total counter',
      `agentic_requests_total ${metrics.requestCount}`,
      '',
      '# HELP agentic_tokens_total Total number of tokens',
      '# TYPE agentic_tokens_total counter',
      `agentic_tokens_total ${metrics.tokenCount}`,
      '',
      '# HELP agentic_errors_total Total number of errors',
      '# TYPE agentic_errors_total counter',
      `agentic_errors_total ${metrics.errorCount}`,
      '',
      '# HELP agentic_cost_total Total cost in USD',
      '# TYPE agentic_cost_total counter',
      `agentic_cost_total ${metrics.totalCostUsd}`,
      '',
      '# HELP agentic_latency_ms Request latency in milliseconds',
      '# TYPE agentic_latency_ms histogram',
      '# There would be latency histogram buckets here',
      '',
    ].join('\n');

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return output;
  });

  // Health check with detailed status
  app.get('/health/detailed', async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = getMetricsSnapshot();

    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      metrics: {
        requests: metrics.requestCount,
        errors: metrics.errorCount,
        errorRate: metrics.requestCount > 0 ? (metrics.errorCount / metrics.requestCount * 100).toFixed(2) + '%' : '0%',
        avgLatencyMs: metrics.avgLatencyMs,
        totalCost: metrics.totalCostUsd,
      },
    });
  });

  // Get budget status
  app.get<{ Params: { userId: string } }>('/budget/:userId', async (request, reply) => {
    try {
      const { userId } = request.params;
      const tracker = getUsageTracker();
      const status = await tracker.getBudgetStatus(userId);

      return reply.send({ success: true, data: status });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch budget status' } });
    }
  });

  // Update budget alert
  app.post<{ Params: { userId: string } }>('/budget/:userId', async (request, reply) => {
    try {
      const { userId } = request.params;
      const { type, limitUsd } = request.body as { type: string; limitUsd: number };

      const manager = getBudgetAlertManager();
      await manager.createAlert(userId, type as 'daily' | 'weekly' | 'monthly' | 'threshold', limitUsd);

      return reply.code(201).send({ success: true, data: { created: true } });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to create budget alert' } });
    }
  });

  // Get user gamification stats
  app.get<{ Params: { userId: string } }>('/stats/:userId', async (request, reply) => {
    try {
      const { userId } = request.params;
      const tracker = getUsageTracker();
      const stats = await tracker.getUserStats(userId);

      return reply.send({ success: true, data: stats });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { code: 'DB_ERROR', message: 'Failed to fetch user stats' } });
    }
  });
}