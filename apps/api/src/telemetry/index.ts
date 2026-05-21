import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';

// OpenTelemetry SDK setup. Off by default; turn on with:
//   OTEL_ENABLED=true             → console exporter
//   OTEL_EXPORTER_OTLP_ENDPOINT=… → OTLP/HTTP exporter (also enables)
//
// Without either env var, the SDK isn't registered; trace.getTracer returns a
// no-op tracer so withSpan() is essentially free.

let sdk: { shutdown: () => Promise<void> } | null = null;

export async function initTelemetry(): Promise<void> {
  const enabled =
    process.env.OTEL_ENABLED === 'true' || !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!enabled) {
    console.log(
      '[Telemetry] disabled (set OTEL_ENABLED=true or OTEL_EXPORTER_OTLP_ENDPOINT to turn on)',
    );
    return;
  }

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { resourceFromAttributes, defaultResource } = await import('@opentelemetry/resources');
    const { ConsoleSpanExporter } = await import('@opentelemetry/sdk-trace-base');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const traceExporter = otlpEndpoint
      ? new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })
      : new ConsoleSpanExporter();

    const resource = defaultResource().merge(
      resourceFromAttributes({
        'service.name': process.env.OTEL_SERVICE_NAME ?? 'agentic-control-tower',
        'service.version': '0.1.0',
        'deployment.environment': process.env.NODE_ENV ?? 'development',
      }),
    );

    const instance = new NodeSDK({ resource, traceExporter });
    instance.start();
    sdk = instance;
    console.log(
      `[Telemetry] enabled — exporter: ${otlpEndpoint ? `otlp(${otlpEndpoint})` : 'console'}`,
    );
  } catch (err) {
    console.warn('[Telemetry] failed to start — continuing without telemetry:', err);
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

export function getTracer(): Tracer {
  return trace.getTracer('agentic-control-tower', '0.1.0');
}

type SpanAttrs = Record<string, string | number | boolean | undefined>;

/**
 * Run `fn` inside a span. Cleans the attribute map (drops undefined values
 * which OTel rejects), records exceptions, and ends the span exactly once.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attrs?: SpanAttrs,
): Promise<T> {
  const cleanAttrs: Record<string, string | number | boolean> = {};
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined) cleanAttrs[k] = v;
    }
  }
  const span = getTracer().startSpan(name, { attributes: cleanAttrs });
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}

// In-process counters kept for the simple /api/metrics endpoint.
// (OTEL metrics are a Phase 6+ enhancement.)
const counters = {
  requests: 0,
  errors: 0,
  tokens: 0,
  costUsd: 0,
  totalLatencyMs: 0,
};

export function recordRequest(params: {
  provider: string;
  model: string;
  status: 'success' | 'error';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
}): void {
  counters.requests += 1;
  counters.tokens += params.inputTokens + params.outputTokens;
  counters.costUsd += params.costUsd;
  counters.totalLatencyMs += params.latencyMs;
  if (params.status === 'error') counters.errors += 1;
}

export function recordError(_provider: string, _model: string, _errorType: string): void {
  counters.errors += 1;
}

export function incrementActiveSessions(_agentId: string): void {
  /* tracked elsewhere if needed */
}

export function decrementActiveSessions(_agentId: string): void {
  /* tracked elsewhere if needed */
}

export function getMetricsSnapshot(): {
  requestCount: number;
  tokenCount: number;
  errorCount: number;
  avgLatencyMs: number;
  totalCostUsd: number;
} {
  return {
    requestCount: counters.requests,
    tokenCount: counters.tokens,
    errorCount: counters.errors,
    avgLatencyMs: counters.requests === 0 ? 0 : counters.totalLatencyMs / counters.requests,
    totalCostUsd: counters.costUsd,
  };
}
