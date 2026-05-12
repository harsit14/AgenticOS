import 'dotenv/config';
import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { providersRouter } from './routes/providers.js';
import { modelsRouter } from './routes/models.js';
import { agentsRouter } from './routes/agents.js';
import { sessionsRouter } from './routes/sessions.js';
import { usageRouter } from './routes/usage.js';
import { settingsRouter } from './routes/settings.js';
import { metricsRouter } from './routes/metrics.js';
import { initTelemetry, shutdownTelemetry } from './telemetry/index.js';
import { db, initDb } from './db/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    getDB: typeof db;
  }
}

async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // Initialize telemetry first
  await initTelemetry();

  // Initialize database
  await initDb();

  // Decorate app with db
  app.decorate('getDB', db);

  // Register plugins
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Register routes
  await app.register(providersRouter, { prefix: '/api/providers' });
  await app.register(modelsRouter, { prefix: '/api/models' });
  await app.register(agentsRouter, { prefix: '/api/agents' });
  await app.register(sessionsRouter, { prefix: '/api/sessions' });
  await app.register(usageRouter, { prefix: '/api/usage' });
  await app.register(settingsRouter, { prefix: '/api/settings' });
  await app.register(metricsRouter, { prefix: '/api/metrics' });

  return app;
}

async function start() {
  try {
    const app = await buildApp();

    const host = process.env.HOST || '0.0.0.0';
    const port = parseInt(process.env.PORT || '3001');

    await app.listen({ host, port });
    app.log.info(`Agentic Control Tower API running on http://${host}:${port}`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('[Server] Shutting down...');
      await shutdownTelemetry();
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export { buildApp };