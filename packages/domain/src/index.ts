export const ESOCIAL_DOMAIN_VERSION = 'r6-skeleton';

export {
  DEFAULT_CIRCUIT_BREAKER_POLICY,
  DEFAULT_RETRY_POLICY,
  ESOCIAL_LOG_FIELD_NAMES,
  ESOCIAL_METRIC_NAMES,
  ReplaySchemaMismatchError,
  assertRequiredLogFields,
  buildMetricPayload,
  buildCircuitBreakerAuditCommand,
  buildDlqItemPersistenceCommand,
  buildRetryDispatchRequest,
  buildReplayRequestFromDlq,
  buildRetryAttemptEvidence,
  buildRetryScheduleCommand,
  buildStructuredLogEntry,
  buildTerminalDlqPayload,
  calculateBackoffDelayMs,
  classifyRetryFailureDetail,
  classifyRetryFailure,
  contextFromEnvelope,
  createInMemoryTraceHarness,
  createMetricEmitter,
  createNoopMetricEmitter,
  createNoopStructuredLogger,
  createPinoLogger,
  createStructuredLogger,
  decideCircuitBreakerState,
  decideReplayClash,
  decideRetry,
  deriveReplayIdempotencyKey,
  listDlqMessages,
  metricNameForStatus,
  pollRetrySchedule,
  recordCircuitBreakerOutcomeWithAudit,
  recordCircuitBreakerOutcome,
  withTraceSpan,
} from './operations/index.js';
export { SubmissionProcessor } from './submission/submission-processor.js';
export {
  RetryableSubmissionError,
  TerminalSubmissionError,
  validateIngressEnvelope,
} from './submission/submission-processor.js';
export {
  SUBMISSION_DISPATCHERS,
  dispatchByEventClass,
} from './submission/submission-dispatcher.js';
export {
  SUBMISSION_ROUTES,
  routeSubmissionEventClass,
} from './submission/submission-router.js';
export {
  SUBMISSION_TOPICS,
  buildSubmissionFifoMetadata,
  buildSubmissionPublishCommand,
} from './transport/submission-publishers.js';
export {
  DeterministicSandboxTransport,
  SoapClientTransport,
  SoapTransportGuardError,
  assertNonProductionEndpointSafe,
  assertSoapEndpointAllowed,
  loadCommittedEnviarLoteWsdl,
  normalizeSoapEnvironment,
  resolveEsocialSoapEndpoints,
  transportFactory,
} from './transport/soap-transport.js';
export {
  S1000_METADATA,
  S1010_METADATA,
  S1200_METADATA,
  S1299_METADATA,
  S2200_METADATA,
  buildS1000,
  buildS1010,
  buildS1200,
  buildS1299,
  buildS2200,
} from './builders/index.js';
export {
  ReturnProcessor,
  parseEsocialReturnXml,
  parseProcessingResponseXml,
  parseProtocolResponseXml,
  parseTotalizerXml,
  protocolFromXml,
  validateReturnIngressEnvelope,
} from './returns/index.js';
export {
  PROMOTED_TABLE_EVENT_CLASSES,
  TABLE_EVENT_METADATA,
  TableBuilderValidationError,
  buildEsocialEventId,
  buildTableEvent,
  buildTableEvents,
  isPromotedTableEventClass,
} from './xml/builders/tables/index.js';
export {
  InMemoryXsdValidationFailureSink,
  XsdValidationError,
  assertPromotedTableXmlValid,
  signValidatedPromotedTableXml,
  validateAndCapturePromotedTableXml,
  validatePromotedTableXml,
} from './xml/xsd-validation.js';
export {
  XmlSecurityError,
  assertHardenedXml,
  sha256Hex,
  sha256Prefixed,
} from './xml/security.js';
export type {
  CircuitBreakerDecision,
  CircuitBreakerAuditCommand,
  CircuitBreakerOutcomeResult,
  CircuitBreakerPolicy,
  CircuitBreakerState,
  DlqItemPersistenceCommand,
  DlqListFilters,
  EndpointCircuitSnapshot,
  EsocialMetricName,
  MetricContext,
  MetricEmitter,
  MetricPayload,
  MetricUnit,
  ReplayClashDecision,
  ReplayRequestResult,
  ReplayableDlqPayload,
  RetryAttemptEvidence,
  RetryDecision,
  RetryDecisionInput,
  RetryFailureClassification,
  RetryFailureClassificationDetail,
  RetryPolicy,
  RetrySchedulePersistenceCommand,
  RetryScheduleCircuitGate,
  RetrySchedulePollerRepository,
  RetrySchedulePollerResult,
  RetrySchedulePublisher,
  RetryScheduleRecord,
  ScheduledRetryDecision,
  StructuredLogContext,
  StructuredLogEntry,
  StructuredLogInput,
  StructuredLogLevel,
  StructuredLogger,
  TerminalDlqPayload,
  TraceSpanRecord,
  TraceSpanSink,
  InMemoryTraceHarness,
} from './operations/index.js';
export type {
  PersistSubmissionCommand,
  SubmissionIngressValidationResult,
  SubmissionPersistenceRecord,
  SubmissionPersistenceStatus,
  SubmissionProcessorResult,
  SubmissionRepository,
  SubmissionRequestEnvelope,
  SubmissionTransportEvidence,
} from './submission/submission-processor.js';
export type {
  SubmissionDispatcher,
  SubmissionDispatchContext,
  SubmissionDispatchResult,
  SubmissionDispatchTransportEvidence,
} from './submission/submission-dispatcher.js';
export type {
  SubmissionRoute,
  SubmissionRouteName,
} from './submission/submission-router.js';
export type {
  BatchProcessingReturn,
  ESocialTotalizerKind,
  EventProcessingReturn,
  ParsedEsocialReturn,
  ParsedIdentity,
  ParsedTotalizerReturn,
  PersistReturnCommand,
  ProtocolParseResult,
  ReturnClassificationStatus,
  ReturnIngressValidationResult,
  ReturnOriginLookup,
  ReturnOriginRecord,
  ReturnOccurrence,
  ReturnPersistenceRecord,
  ReturnProcessorOptions,
  ReturnProcessorResult,
  ReturnPublishers,
  ReturnRepository,
  ReturnRequestEnvelope,
  ReturnResponseClassification,
} from './returns/index.js';
export type {
  MalformedSubmissionDlqEnvelope,
  SubmissionDlqEnvelope,
  SubmissionFifoMetadata,
  SubmissionPublisher,
  SubmissionPublishCommand,
  SubmissionPublishers,
  SubmissionTopicFamily,
} from './transport/submission-publishers.js';
export type {
  DeterministicSandboxTransportOptions,
  LegacySoapEnvironment,
  ResolveSoapEndpointOptions,
  SoapContext,
  SoapEndpointConfig,
  SoapEndpointGuardOptions,
  SoapEndpointSet,
  SoapEnvironment,
  SoapLogger,
  SoapResult,
  SoapStatus,
  SoapSubmitOperation,
  SoapTransport,
  SoapClientTransportOptions,
  TransportFactoryOptions,
} from './transport/soap-transport.js';
export type {
  BuilderContext,
  BuilderMetadata,
  BuiltXml,
} from './builders/index.js';
export type {
  BuiltTableXmlEvent,
  EsocialEnvironment,
  EsocialTableOperation,
  PromotedTableEventClass,
  S1000TableDto,
  S1005TableDto,
  S1010TableDto,
  S1020TableDto,
  S1050TableDto,
  S1070TableDto,
  TableEventDto,
  TableEventDtoBase,
  TableEventMetadata,
  TableSourceEntityKind,
  TableVersionDependency,
} from './xml/builders/tables/index.js';
export type {
  PromotedTableXsdValidationInput,
  PromotedTableXsdValidationResult,
  XsdValidationFailureRecord,
  XsdValidationFailureSink,
  XsdValidationIssue,
  XsdValidationSeverity,
} from './xml/xsd-validation.js';

export type EsocialDomainBoundary = Readonly<{
  database: 'isolated-esocial';
  sgpDatabaseAccess: false;
  allowedIngress: 'sqs' | 'sgp-backend-https';
}>;
