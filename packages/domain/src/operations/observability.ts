export const ESOCIAL_LOG_FIELD_NAMES = [
  'requestId',
  'correlationId',
  'tenantId',
  'eventClass',
  'batchId',
  'protocol',
  'receipt',
  'idempotencyKey',
] as const;

export const ESOCIAL_METRIC_NAMES = {
  accepted: 'esocial.accepted',
  rejected: 'esocial.rejected',
  retry: 'esocial.retry',
  dlq: 'esocial.dlq',
  timeout: 'esocial.timeout',
  soapLatencyMs: 'esocial.soap_latency_ms',
  queueAgeMs: 'esocial.queue_age_ms',
  parserFailures: 'esocial.parser_failures',
} as const;

export type EsocialMetricName =
  (typeof ESOCIAL_METRIC_NAMES)[keyof typeof ESOCIAL_METRIC_NAMES];

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type StructuredLogContext = Readonly<{
  requestId?: string | undefined;
  correlationId?: string | undefined;
  tenantId?: string | undefined;
  environment?: string | undefined;
  eventClass?: string | undefined;
  batchId?: string | undefined;
  protocol?: string | undefined;
  receipt?: string | undefined;
  idempotencyKey?: string | undefined;
}>;

export type StructuredLogEntry = StructuredLogContext &
  Readonly<{
    timestamp: string;
    level: StructuredLogLevel;
    service: string;
    stage: string;
    message: string;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
  }>;

export type StructuredLogInput = Readonly<{
  level: StructuredLogLevel;
  service: string;
  stage: string;
  message: string;
  context?: StructuredLogContext | undefined;
  error?: Readonly<{
    code?: string | undefined;
    message?: string | undefined;
  }>;
  now?: Date | undefined;
}>;

export type StructuredLogger = Readonly<{
  debug(input: Omit<StructuredLogInput, 'level'>): void;
  info(input: Omit<StructuredLogInput, 'level'>): void;
  warn(input: Omit<StructuredLogInput, 'level'>): void;
  error(input: Omit<StructuredLogInput, 'level'>): void;
}>;

export type MetricUnit = 'Count' | 'Milliseconds';

export type MetricContext = StructuredLogContext &
  Readonly<{
    classification?: string | undefined;
    endpointName?: string | undefined;
  }>;

export type MetricPayload = MetricContext &
  Readonly<{
    _aws: {
      Timestamp: number;
      CloudWatchMetrics: readonly [
        {
          Namespace: 'Stynx/eSocial';
          Dimensions: readonly [readonly string[]];
          Metrics: readonly [
            {
              Name: EsocialMetricName;
              Unit: MetricUnit;
            },
          ];
        },
      ];
    };
  }> &
  Readonly<Record<EsocialMetricName, number | undefined>>;

export type MetricEmitter = Readonly<{
  emit(
    name: EsocialMetricName,
    value: number,
    context?: MetricContext,
    unit?: MetricUnit,
    now?: Date,
  ): void;
}>;

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

export function buildStructuredLogEntry(
  input: StructuredLogInput,
): StructuredLogEntry {
  return compactObject({
    timestamp: (input.now ?? new Date()).toISOString(),
    level: input.level,
    service: input.service,
    stage: input.stage,
    message: input.message,
    ...input.context,
    errorCode: input.error?.code,
    errorMessage: input.error?.message,
  }) as StructuredLogEntry;
}

export function createStructuredLogger(options: Readonly<{
  sink?: (line: string) => void | undefined;
}> = {}): StructuredLogger {
  const sink = options.sink ?? ((line: string) => console.log(line));

  function write(level: StructuredLogLevel, input: Omit<StructuredLogInput, 'level'>): void {
    sink(JSON.stringify(buildStructuredLogEntry({ ...input, level })));
  }

  return {
    debug: (input) => write('debug', input),
    info: (input) => write('info', input),
    warn: (input) => write('warn', input),
    error: (input) => write('error', input),
  };
}

export function createNoopStructuredLogger(): StructuredLogger {
  return createStructuredLogger({ sink: () => undefined });
}

export function buildMetricPayload(input: Readonly<{
  name: EsocialMetricName;
  value: number;
  context?: MetricContext | undefined;
  unit?: MetricUnit | undefined;
  now?: Date | undefined;
}>): MetricPayload {
  const context = compactObject(input.context ?? {}) as MetricContext;
  const dimensions = [
    'tenantId',
    'environment',
    'eventClass',
    'classification',
    'endpointName',
  ].filter((name) => Object.hasOwn(context, name));

  return compactObject({
    _aws: {
      Timestamp: (input.now ?? new Date()).getTime(),
      CloudWatchMetrics: [
        {
          Namespace: 'Stynx/eSocial',
          Dimensions: [dimensions],
          Metrics: [
            {
              Name: input.name,
              Unit: input.unit ?? defaultMetricUnit(input.name),
            },
          ],
        },
      ],
    },
    ...context,
    [input.name]: input.value,
  }) as MetricPayload;
}

export function createMetricEmitter(options: Readonly<{
  sink?: (line: string) => void | undefined;
}> = {}): MetricEmitter {
  const sink = options.sink ?? ((line: string) => console.log(line));

  return {
    emit: (name, value, context, unit, now) => {
      sink(JSON.stringify(buildMetricPayload({ name, value, context, unit, now })));
    },
  };
}

export function createNoopMetricEmitter(): MetricEmitter {
  return createMetricEmitter({ sink: () => undefined });
}

export function contextFromEnvelope(
  envelope: unknown,
  extra: StructuredLogContext = {},
): StructuredLogContext {
  const record = recordOrEmpty(envelope);
  const payload = recordOrEmpty(record.payload);

  return compactObject({
    requestId: stringValue(record['request-id']),
    correlationId: stringValue(record['correlation-id']),
    tenantId: stringValue(record.tenant_id),
    environment: stringValue(record.environment),
    eventClass: stringValue(record.event_class),
    batchId:
      stringValue(record.batch_id) ??
      stringValue(payload.batchId) ??
      stringValue(payload.batch_id),
    protocol:
      stringValue(record.protocol_number) ??
      stringValue(payload.protocolNumber) ??
      stringValue(payload.protocol),
    receipt:
      stringValue(record.receipt_number) ??
      stringValue(payload.receiptNumber) ??
      stringValue(payload.receipt),
    idempotencyKey: stringValue(record['idempotency-key']),
    ...extra,
  }) as StructuredLogContext;
}

export async function withTraceSpan<TResult>(
  input: Readonly<{
    service: string;
    spanName: string;
    context?: StructuredLogContext | undefined;
    sink?: ((span: TraceSpanRecord) => void) | undefined;
    now?: (() => Date) | undefined;
  }>,
  run: () => Promise<TResult>,
): Promise<TResult> {
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const startedMs = startedAt.getTime();

  try {
    const result = await run();
    emitTraceSpan(input, startedAt, now(), startedMs, 'ok');
    return result;
  } catch (error) {
    emitTraceSpan(
      input,
      startedAt,
      now(),
      startedMs,
      'error',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

function emitTraceSpan(
  input: Readonly<{
    service: string;
    spanName: string;
    context?: StructuredLogContext | undefined;
    sink?: ((span: TraceSpanRecord) => void) | undefined;
  }>,
  startedAt: Date,
  endedAt: Date,
  startedMs: number,
  status: TraceSpanRecord['status'],
  errorMessage?: string,
): void {
  input.sink?.(
    compactObject({
      service: input.service,
      spanName: input.spanName,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, endedAt.getTime() - startedMs),
      status,
      errorMessage,
      ...input.context,
    }) as TraceSpanRecord,
  );
}

function defaultMetricUnit(name: EsocialMetricName): MetricUnit {
  return name.endsWith('_ms') ? 'Milliseconds' : 'Count';
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
