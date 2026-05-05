import {
  SpanStatusCode,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import type { StructuredLogContext } from './logger.js';

export type TraceSpanRecord = StructuredLogContext &
  Readonly<{
    spanName: string;
    service: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    status: 'ok' | 'error';
    errorMessage?: string | undefined;
  }>;

export type TraceSpanSink = (span: TraceSpanRecord) => void;

export type InMemoryTraceHarness = Readonly<{
  exporter: InMemorySpanExporter;
  getFinishedSpans(): readonly ReadableSpan[];
  reset(): void;
}>;

export function createInMemoryTraceHarness(): InMemoryTraceHarness {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  return {
    exporter,
    getFinishedSpans: () => exporter.getFinishedSpans(),
    reset: () => exporter.reset(),
  };
}

export async function withTraceSpan<TResult>(
  input: Readonly<{
    service: string;
    spanName: string;
    context?: StructuredLogContext | undefined;
    sink?: TraceSpanSink | undefined;
    now?: (() => Date) | undefined;
  }>,
  run: () => Promise<TResult>,
): Promise<TResult> {
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const startedMs = startedAt.getTime();
  const tracer = trace.getTracer(input.service);
  const carrier = baggageCarrier(input.context);

  const parentContext = propagation.extract(otelContext.active(), carrier, {
    keys: (source) => Object.keys(source),
    get: (source, key) => source[key],
  });
  const span = tracer.startSpan(input.spanName, undefined, parentContext);
  return otelContext.with(trace.setSpan(parentContext, span), async () => {
    annotateSpan(span, input);
    try {
      const result = await run();
      span?.setStatus({ code: SpanStatusCode.OK });
      emitTraceSpan(input, startedAt, now(), startedMs, 'ok');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      span?.recordException(error instanceof Error ? error : new Error(errorMessage));
      span?.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
      emitTraceSpan(input, startedAt, now(), startedMs, 'error', errorMessage);
      throw error;
    } finally {
      span?.end();
    }
  });
}

function annotateSpan(
  span: Span | undefined,
  input: Readonly<{
    service: string;
    spanName: string;
    context?: StructuredLogContext | undefined;
  }>,
): void {
  if (!span) return;
  span.setAttribute('service.name', input.service);
  span.setAttribute('esocial.stage', input.spanName);
  for (const [key, value] of Object.entries(input.context ?? {})) {
    if (value !== undefined) span.setAttribute(`esocial.${key}`, String(value));
  }
}

function baggageCarrier(context: StructuredLogContext | undefined): Record<string, string> {
  return {
    baggage: context?.correlationId
      ? `correlationId=${encodeURIComponent(context.correlationId)}`
      : '',
  };
}

function emitTraceSpan(
  input: Readonly<{
    service: string;
    spanName: string;
    context?: StructuredLogContext | undefined;
    sink?: TraceSpanSink | undefined;
  }>,
  startedAt: Date,
  endedAt: Date,
  startedMs: number,
  status: TraceSpanRecord['status'],
  errorMessage?: string,
): void {
  input.sink?.({
    service: input.service,
    spanName: input.spanName,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedMs),
    status,
    errorMessage,
    ...input.context,
  });
}
