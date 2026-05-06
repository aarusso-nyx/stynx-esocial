export const ESOCIAL_OBSERVABILITY_NAMESPACE = 'Stynx/eSocial';

export const ESOCIAL_LOG_FIELD_NAMES = [
  'requestId',
  'correlationId',
  'tenantId',
  'eventClass',
  'batchId',
  'protocol',
  'receipt',
  'idempotencyKey',
  'attempt',
  'stage',
] as const;

export const ESOCIAL_REQUIRED_LOG_FIELDS = ESOCIAL_LOG_FIELD_NAMES;

export const ESOCIAL_METRIC_NAMES = {
  accepted: 'esocial.accepted',
  rejected: 'esocial.rejected',
  retry: 'esocial.retry',
  dlq: 'esocial.dlq',
  timeout: 'esocial.timeout',
  validationFailed: 'esocial.validation_failed',
  parserFailures: 'esocial.parser_failures',
  circuitOpenEvents: 'esocial.circuit_open_events',
  certificateDaysUntilExpiry: 'esocial.certificate_days_until_expiry',
  soapLatencyMs: 'esocial.soap_latency_ms',
  xsdLatencyMs: 'esocial.xsd_latency_ms',
  signLatencyMs: 'esocial.sign_latency_ms',
  queueAgeMs: 'esocial.queue_age_ms',
} as const;

export const ESOCIAL_COUNTER_METRICS = [
  ESOCIAL_METRIC_NAMES.accepted,
  ESOCIAL_METRIC_NAMES.rejected,
  ESOCIAL_METRIC_NAMES.retry,
  ESOCIAL_METRIC_NAMES.dlq,
  ESOCIAL_METRIC_NAMES.timeout,
  ESOCIAL_METRIC_NAMES.validationFailed,
  ESOCIAL_METRIC_NAMES.parserFailures,
  ESOCIAL_METRIC_NAMES.circuitOpenEvents,
] as const;

export const ESOCIAL_HISTOGRAM_METRICS = [
  ESOCIAL_METRIC_NAMES.certificateDaysUntilExpiry,
  ESOCIAL_METRIC_NAMES.soapLatencyMs,
  ESOCIAL_METRIC_NAMES.xsdLatencyMs,
  ESOCIAL_METRIC_NAMES.signLatencyMs,
  ESOCIAL_METRIC_NAMES.queueAgeMs,
] as const;

export const ESOCIAL_TRACE_SPAN_NAMES = [
  'handler',
  'ingress',
  'ingress-validation',
  'idempotency-lookup',
  'build',
  'xsd',
  'sign',
  'soap',
  'submit',
  'parse-return',
  'persist',
  'publish',
] as const;

export const ESOCIAL_HANDLER_STAGE_SEQUENCE = [
  'ingress',
  'idempotency-lookup',
  'build',
  'xsd',
  'sign',
  'submit',
  'parse-return',
  'publish',
] as const;

export type EsocialMetricName =
  (typeof ESOCIAL_METRIC_NAMES)[keyof typeof ESOCIAL_METRIC_NAMES];

export type EsocialLogFieldName = (typeof ESOCIAL_LOG_FIELD_NAMES)[number];
export type EsocialTraceSpanName = (typeof ESOCIAL_TRACE_SPAN_NAMES)[number];
