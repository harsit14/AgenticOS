import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader, PeriodicExportingMetricReaderOptions } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, metrics, Span, SpanStatusCode } from '@opentelemetry/api';
import type { ChatParams, ChatResponse } from '@agentic-os/types';

// Initialize OpenTelemetry SDK
let sdk: NodeSDK | null = null;

export async function initTelemetry(): Promise<void> {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'agentic-control-tower';
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: '0.1.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000, // Export every 60 seconds
  } as PeriodicExportingMetricReaderOptions);

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    console.log('[Telemetry] OpenTelemetry SDK initialized');
  } catch (error) {
    console.warn('[Telemetry] Failed to initialize OpenTelemetry:', error);
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    console.log('[Telemetry] OpenTelemetry SDK shut down');
  }
}

// Get tracer and meter
export function getTracer() {
  return trace.getTracer('agentic-control-tower', '0.1.0');
}

export function getMeter() {
  return metrics.getMeter('agentic-control-tower', '0.1.0');
}

// Create metrics
const meter = metrics.getMeter('agentic-control-tower', '0.1.0');

// Counter metrics
const requestCounter = meter.createCounter('llm_requests_total', {
  description: 'Total number of LLM requests',
});

const tokenCounter = meter.createCounter('llm_tokens_total', {
  description: 'Total number of tokens used',
  unit: 'tokens',
});

const errorCounter = meter.createCounter('llm_errors_total', {
  description: 'Total number of LLM errors',
});

// Histogram metrics
const latencyHistogram = meter.createHistogram('llm_latency_ms', {
  description: 'LLM request latency in milliseconds',
  unit: 'ms',
});

const costHistogram = meter.createHistogram('llm_cost_usd', {
  description: 'LLM request cost in USD',
  unit: 'USD',
});

// Gauge metrics
const activeSessionsGauge = meter.createObservableGauge('agent_sessions_active', {
  description: 'Number of active agent sessions',
});

const contextWindowGauge = meter.createObservableGauge('agent_context_window_usage', {
  description: 'Context window usage percentage',
});

// Record metrics
export function recordRequest(params: {
  provider: string;
  model: string;
  status: 'success' | 'error';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
}): void {
  const labels = { provider: params.provider, model: params.model, status: params.status };

  requestCounter.add(1, labels);
  tokenCounter.add(params.inputTokens, { ...labels, type: 'input' });
  tokenCounter.add(params.outputTokens, { ...labels, type: 'output' });
  latencyHistogram.record(params.latencyMs, labels);
  costHistogram.record(params.costUsd, labels);

  if (params.status === 'error') {
    errorCounter.add(1, labels);
  }
}

export function recordError(provider: string, model: string, errorType: string): void {
  errorCounter.add(1, { provider, model, status: 'error', errorType });
}

// Span helpers for LLM calls
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    attributes,
  });

  const ctx = trace.setSpan(trace.setActiveSpan(trace.getActiveSpan()), span);

  try {
    const result = await trace.with(ctx, fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: (error as Error).message,
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

// Span wrapper for LLM calls with automatic attribute recording
export async function withLLMSpan<T extends { usage: { inputTokens: number; outputTokens: number }; latencyMs: number; costUsd: number }>(
  operation: string,
  provider: string,
  model: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(
    `llm.${operation}`,
    fn,
    {
      'provider.id': provider,
      'model.id': model,
      'llm.operation': operation,
    }
  );
}

// Active sessions tracking
let activeSessions = new Map<string, number>();

export function incrementActiveSessions(agentId: string): void {
  const current = activeSessions.get(agentId) || 0;
  activeSessions.set(agentId, current + 1);
}

export function decrementActiveSessions(agentId: string): void {
  const current = activeSessions.get(agentId) || 0;
  activeSessions.set(agentId, Math.max(0, current - 1));
}

export function getActiveSessionCount(agentId?: string): number {
  if (agentId) {
    return activeSessions.get(agentId) || 0;
  }
  return Array.from(activeSessions.values()).reduce((sum, count) => sum + count, 0);
}

// Register gauge callbacks
activeSessionsGauge.addCallback((observableResult) => {
  for (const [agentId, count] of activeSessions) {
    observableResult.observe(count, { agent_id: agentId });
  }
});

// Export for external metrics systems
export function getMetricsSnapshot(): {
  requestCount: number;
  tokenCount: number;
  errorCount: number;
  avgLatencyMs: number;
  totalCostUsd: number;
} {
  return {
    requestCount: 0, // Would need to track these
    tokenCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
    totalCostUsd: 0,
  };
}