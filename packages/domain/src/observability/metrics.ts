import {
  ESOCIAL_METRIC_NAMES,
  ESOCIAL_OBSERVABILITY_NAMESPACE,
} from './constants.js';
import type {
  EsocialMetricName,
} from './constants.js';
import type {
  StructuredLogContext,
} from './logger.js';
import { redactForLog } from './redaction.js';

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
          Namespace: typeof ESOCIAL_OBSERVABILITY_NAMESPACE;
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

  return redactForLog(compactObject({
    _aws: {
      Timestamp: (input.now ?? new Date()).getTime(),
      CloudWatchMetrics: [
        {
          Namespace: ESOCIAL_OBSERVABILITY_NAMESPACE,
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
  })) as MetricPayload;
}

export function createMetricEmitter(options: Readonly<{
  sink?: (line: string) => void | undefined;
}> = {}): MetricEmitter {
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));

  return {
    emit: (name, value, context, unit, now) => {
      sink(JSON.stringify(buildMetricPayload({ name, value, context, unit, now })));
    },
  };
}

export function createNoopMetricEmitter(): MetricEmitter {
  return createMetricEmitter({ sink: () => undefined });
}

export function metricNameForStatus(status: string): EsocialMetricName | undefined {
  if (status === 'accepted' || status === 'sent' || status === 'building') {
    return ESOCIAL_METRIC_NAMES.accepted;
  }
  if (status === 'rejected') return ESOCIAL_METRIC_NAMES.rejected;
  if (status === 'retry') return ESOCIAL_METRIC_NAMES.retry;
  if (status === 'dlq') return ESOCIAL_METRIC_NAMES.dlq;
  if (status === 'timeout') return ESOCIAL_METRIC_NAMES.timeout;
  if (status === 'validation_failed') return ESOCIAL_METRIC_NAMES.validationFailed;
  if (status === 'failed') return ESOCIAL_METRIC_NAMES.parserFailures;
  return undefined;
}

function defaultMetricUnit(name: EsocialMetricName): MetricUnit {
  return name.endsWith('_ms') ? 'Milliseconds' : 'Count';
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
