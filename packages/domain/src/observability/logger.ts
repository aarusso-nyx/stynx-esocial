import pino from 'pino';
import type { Logger as PinoLogger } from 'pino';

import {
  ESOCIAL_LOG_FIELD_NAMES,
} from './constants.js';
import { redactForLog } from './redaction.js';

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
  attempt?: number | string | undefined;
}>;

export type StructuredLogEntry = StructuredLogContext &
  Readonly<{
    timestamp: string;
    level: StructuredLogLevel;
    service: string;
    stage: string;
    message: string;
    requestId: string | null;
    correlationId: string | null;
    tenantId: string | null;
    eventClass: string | null;
    batchId: string | null;
    protocol: string | null;
    receipt: string | null;
    idempotencyKey: string | null;
    attempt: number | string | null;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
  }>;

export type StructuredLogInput = Readonly<{
  level: StructuredLogLevel;
  service: string;
  stage: string;
  message: string;
  context?: StructuredLogContext | undefined;
  data?: Record<string, unknown> | undefined;
  error?: Readonly<{
    code?: string | undefined;
    message?: string | undefined;
  }>;
  now?: Date | undefined;
}>;

export type StructuredLogger = Readonly<{
  debug(input: Omit<StructuredLogInput, 'level' | 'service'>): void;
  info(input: Omit<StructuredLogInput, 'level' | 'service'>): void;
  warn(input: Omit<StructuredLogInput, 'level' | 'service'>): void;
  error(input: Omit<StructuredLogInput, 'level' | 'service'>): void;
}>;

export type LoggerFactoryOptions = Readonly<{
  service: string;
  level?: StructuredLogLevel | undefined;
  sink?: ((line: string) => void) | undefined;
  now?: (() => Date) | undefined;
}>;

export function buildStructuredLogEntry(
  input: StructuredLogInput,
): StructuredLogEntry {
  const context = input.context ?? {};
  return redactForLog({
    timestamp: (input.now ?? new Date()).toISOString(),
    level: input.level,
    service: input.service,
    stage: input.stage,
    message: input.message,
    requestId: context.requestId ?? null,
    correlationId: context.correlationId ?? null,
    tenantId: context.tenantId ?? null,
    environment: context.environment,
    eventClass: context.eventClass ?? null,
    batchId: context.batchId ?? null,
    protocol: context.protocol ?? null,
    receipt: context.receipt ?? null,
    idempotencyKey: context.idempotencyKey ?? null,
    attempt: context.attempt ?? null,
    errorCode: input.error?.code,
    errorMessage: input.error?.message,
    ...(input.data ?? {}),
  }) as StructuredLogEntry;
}

export function createLoggerFactory(
  defaults: Omit<LoggerFactoryOptions, 'service'> = {},
): (service: string) => StructuredLogger {
  return (service) => createPinoLogger({ ...defaults, service });
}

export function createPinoLogger(options: LoggerFactoryOptions): StructuredLogger {
  const now = options.now ?? (() => new Date());
  const sink = options.sink;
  const pinoLogger = pino(
    {
      base: null,
      level: options.level ?? defaultLogLevel(),
      messageKey: 'message',
      timestamp: false,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    },
    sink
      ? {
          write(line: string): void {
            sink(line.trimEnd());
          },
        }
      : undefined,
  );

  function write(
    level: StructuredLogLevel,
    input: Omit<StructuredLogInput, 'level' | 'service'>,
  ): void {
    const entry = buildStructuredLogEntry({
      ...input,
      level,
      service: options.service,
      now: now(),
    });
    writePino(pinoLogger, level, entry);
  }

  return {
    debug: (input) => write('debug', input),
    info: (input) => write('info', input),
    warn: (input) => write('warn', input),
    error: (input) => write('error', input),
  };
}

export function createStructuredLogger(options: Readonly<{
  service?: string | undefined;
  sink?: (line: string) => void | undefined;
  level?: StructuredLogLevel | undefined;
  now?: (() => Date) | undefined;
}> = {}): StructuredLogger {
  return createPinoLogger({
    service: options.service ?? 'esocial',
    sink: options.sink,
    level: options.level,
    now: options.now,
  });
}

export function createNoopStructuredLogger(): StructuredLogger {
  return createPinoLogger({
    service: 'noop',
    level: 'debug',
    sink: () => undefined,
  });
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
      stringValue(record.batch_id)
      ?? stringValue(payload.batchId)
      ?? stringValue(payload.batch_id),
    protocol:
      stringValue(record.protocol_number)
      ?? stringValue(payload.protocolNumber)
      ?? stringValue(payload.protocol),
    receipt:
      stringValue(record.receipt_number)
      ?? stringValue(payload.receiptNumber)
      ?? stringValue(payload.receipt),
    idempotencyKey: stringValue(record['idempotency-key']),
    attempt: numberOrString(record.attempt),
    ...extra,
  }) as StructuredLogContext;
}

export function assertRequiredLogFields(entry: Record<string, unknown>): void {
  for (const field of ESOCIAL_LOG_FIELD_NAMES) {
    if (!Object.hasOwn(entry, field)) {
      throw new Error(`Structured log entry is missing ${field}.`);
    }
  }
}

function defaultLogLevel(): StructuredLogLevel {
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function writePino(
  logger: PinoLogger,
  level: StructuredLogLevel,
  entry: StructuredLogEntry,
): void {
  if (level === 'debug') logger.debug(entry);
  else if (level === 'warn') logger.warn(entry);
  else if (level === 'error') logger.error(entry);
  else logger.info(entry);
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

function numberOrString(value: unknown): number | string | undefined {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}
