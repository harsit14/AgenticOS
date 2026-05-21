import 'dotenv/config';
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
import { db, initDb, dbDir } from './db/index.js';
import { setCipher } from './core/settings/cipher.js';
import { createAesCipher } from './core/settings/aes-cipher.js';
import {
  AuthenticationError,
  ContextLengthError,
  LLMError,
  RateLimitError,
} from './core/providers/types.js';
import {
  ConfigurationError,
  InvalidInputError,
  NotFoundError,
} from './core/errors.js';

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

  // Encrypt sensitive settings (provider API keys) at rest. Must be set before
  // any settings read/write; decrypt() is backwards-compatible with plaintext.
  setCipher(createAesCipher(dbDir));

  // Decorate app with db
  app.decorate('getDB', db);

  // Register plugins
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  });

  // Global error handler — maps known error classes to HTTP responses so
  // route handlers can `throw` instead of repeating try/catch + manual replies.
  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err, requestId: request.id }, 'request failed');

    if (err instanceof NotFoundError) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: err.message },
      });
    }
    if (err instanceof InvalidInputError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: err.message,
          details: (err as InvalidInputError).details,
        },
      });
    }
    if (err instanceof ConfigurationError) {
      return reply.code(409).send({
        success: false,
        error: { code: 'CONFIGURATION', message: err.message },
      });
    }
    if (err instanceof RateLimitError) {
      return reply
        .code(429)
        .header('Retry-After', String(err.retryAfterMs ?? 60_000))
        .send({
          success: false,
          error: { code: 'RATE_LIMITED', message: err.message },
        });
    }
    if (err instanceof AuthenticationError) {
      return reply.code(401).send({
        success: false,
        error: { code: 'AUTH_FAILED', message: err.message },
      });
    }
    if (err instanceof ContextLengthError) {
      return reply.code(413).send({
        success: false,
        error: { code: 'CONTEXT_TOO_LONG', message: err.message },
      });
    }
    if (err instanceof LLMError) {
      return reply.code(502).send({
        success: false,
        error: { code: 'LLM_ERROR', message: err.message },
      });
    }
    // Fastify's built-in schema validation
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION',
          message: err.message,
          details: (err as { validation: unknown }).validation,
        },
      });
    }
    return reply.code(500).send({
      success: false,
      error: { code: 'INTERNAL', message: 'Internal server error', requestId: request.id },
    });
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

    // Local-first: bind to loopback by default so the API isn't exposed on the
    // LAN. Override with BIND_HOST (or legacy HOST) only if you know you want
    // network exposure — there is no auth on this API.
    const host = process.env.BIND_HOST || process.env.HOST || '127.0.0.1';
    const port = parseInt(process.env.PORT || '3001');

    await app.listen({ host, port });
    app.log.info(`Agentic Control Tower API running on http://${host}:${port}`);
    if (host === '0.0.0.0' || host === '::') {
      app.log.warn(
        `[Security] API is bound to ${host} and reachable from the network. ` +
          'This API has no authentication — do not expose it on an untrusted LAN.',
      );
    }

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