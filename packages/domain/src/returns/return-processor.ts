import {
  ESOCIAL_CLASSES,
  ESOCIAL_CONTRACT_VERSION,
  ESOCIAL_ENVIRONMENTS,
  ESOCIAL_RELAY_EVENT_CLASSES,
} from '@esocial/contracts';
import type {
  AuditEventEnvelope,
  EsocialClass,
  EsocialContractError,
  EsocialDlqEnvelope,
  EsocialRelayEventClass,
  EsocialStatus,
  QueueAdapterRequestEnvelope,
  SpoolUpdateEnvelope,
} from '@esocial/contracts';

import {
  buildSubmissionPublishCommand,
} from '../transport/submission-publishers.js';
import type {
  SubmissionPublisher,
} from '../transport/submission-publishers.js';
import { sha256Prefixed } from '../xml/security.js';

import {
  ReturnXmlParseError,
  parseEsocialReturnXml,
} from './parsers.js';
import type {
  ParsedEsocialReturn,
} from './parsers.js';

const NIL_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const FALLBACK_EVENT_CLASS = 'S-1299';

export type ReturnRequestEnvelope =
  QueueAdapterRequestEnvelope<EsocialClass, unknown>;

export type ReturnClassificationStatus =
  | 'ACCEPTED'
  | 'REJECTED'
  | 'RETRY'
  | 'TIMEOUT'
  | 'DLQ'
  | 'FAILED'
  | 'OPERATOR_ACTION';

export type ReturnResponseClassification = Readonly<{
  responseCode: string;
  canonicalStatus: ReturnClassificationStatus;
  retryable: boolean;
  category: string;
  description: string;
  operatorActionRequired: boolean;
}>;

export type PersistReturnCommand = Readonly<{
  envelope: ReturnRequestEnvelope;
  rawResponseXml: string;
  responseHash: string;
  parsed: ParsedEsocialReturn | null;
  classification?: ReturnResponseClassification | undefined;
  status: EsocialStatus;
  previousStatus?: EsocialStatus | undefined;
  occurredAt: string;
  eventRecordId: string;
  batchId: string;
  protocol?: string | undefined;
  receipt?: string | undefined;
  competence?: string | undefined;
  totalizerClass?: EsocialRelayEventClass | undefined;
  sourceEventClass?: EsocialRelayEventClass | undefined;
  errors: readonly EsocialContractError[];
  auditFlags: readonly string[];
}>;

export type ReturnPersistenceRecord = Readonly<{
  inserted: boolean;
  messageId: string;
  eventRecordId: string;
  batchId: string;
  status: EsocialStatus;
  previousStatus?: EsocialStatus | undefined;
  responseHash: string;
  protocol?: string | undefined;
  receipt?: string | undefined;
  totalizerId?: string | undefined;
  totalizerClass?: EsocialRelayEventClass | undefined;
  competence?: string | undefined;
  createdAt: string;
  updatedAt: string;
}>;

export type ReturnOriginLookup = Readonly<{
  tenantId: string;
  environment: string;
  protocol?: string | undefined;
  receipt?: string | undefined;
}>;

export type ReturnOriginRecord = Readonly<{
  eventRecordId: string;
  batchId: string;
  previousStatus?: EsocialStatus | undefined;
  sourceEventClass?: EsocialRelayEventClass | undefined;
  competence?: string | undefined;
}>;

export type ReturnRepository = Readonly<{
  classifyResponseCode(input: Readonly<{
    environment: string;
    responseCode: string;
  }>): Promise<ReturnResponseClassification | undefined>;
  resolveOrigin?(input: ReturnOriginLookup): Promise<ReturnOriginRecord | undefined>;
  persist(command: PersistReturnCommand): Promise<ReturnPersistenceRecord>;
}>;

export type ReturnPublishers = Readonly<{
  spool: SubmissionPublisher<SpoolUpdateEnvelope>;
  audit: SubmissionPublisher<AuditEventEnvelope>;
  dlq: SubmissionPublisher<EsocialDlqEnvelope>;
}>;

export type ReturnProcessorResult = Readonly<{
  parsed: ParsedEsocialReturn | null;
  record: ReturnPersistenceRecord;
  spoolUpdate: SpoolUpdateEnvelope;
  auditEvent: AuditEventEnvelope;
}>;

export type ReturnIngressValidationResult =
  | Readonly<{
      ok: true;
      envelope: ReturnRequestEnvelope;
    }>
  | Readonly<{
      ok: false;
      error: EsocialContractError;
      candidate?: Record<string, unknown> | undefined;
      rawBody?: string | undefined;
    }>;

export type ReturnProcessorOptions = Readonly<{
  repository: ReturnRepository;
  publishers: ReturnPublishers;
  now?: (() => Date) | undefined;
}>;

export class ReturnProcessor {
  private readonly repository: ReturnRepository;
  private readonly publishers: ReturnPublishers;
  private readonly now: () => Date;

  constructor(options: ReturnProcessorOptions) {
    this.repository = options.repository;
    this.publishers = options.publishers;
    this.now = options.now ?? (() => new Date());
  }

  async process(request: ReturnRequestEnvelope): Promise<ReturnProcessorResult> {
    const occurredAt = this.now().toISOString();
    const payload = recordOrEmpty(request.payload);
    const rawResponseXml = stringValue(payload['rawResponseXml'])
      ?? stringValue(payload['responseXml'])
      ?? '';
    const responseHash = sha256Prefixed(rawResponseXml);
    const parsedOutcome = await this.parseAndClassify(
      request.environment,
      rawResponseXml,
      occurredAt,
    );
    const protocol = parsedOutcome.parsed?.protocol
      ?? stringValue(payload['protocolNumber'])
      ?? undefined;
    const receipt = parsedOutcome.parsed?.receipt
      ?? stringValue(payload['receiptNumber'])
      ?? undefined;
    const totalizerClass =
      parsedOutcome.parsed?.kind === 'totalizer'
        ? parsedOutcome.parsed.totalizer.kind
        : undefined;
    const competence =
      parsedOutcome.parsed?.kind === 'totalizer'
        ? parsedOutcome.parsed.totalizer.competence
        : stringValue(payload['competence']) ?? undefined;
    const origin = await this.resolveOrigin({
      request,
      payload,
      protocol,
      receipt,
      competence,
    });

    const record = await this.repository.persist({
      envelope: request,
      rawResponseXml,
      responseHash,
      parsed: parsedOutcome.parsed,
      classification: parsedOutcome.classification,
      status: parsedOutcome.status,
      previousStatus: origin.previousStatus,
      occurredAt,
      eventRecordId: origin.eventRecordId,
      batchId: origin.batchId,
      protocol,
      receipt,
      competence: origin.competence ?? competence,
      totalizerClass,
      sourceEventClass: origin.sourceEventClass,
      errors: parsedOutcome.errors,
      auditFlags: parsedOutcome.auditFlags,
    });
    const spoolUpdate = buildReturnSpoolUpdateEnvelope(
      request,
      record,
      parsedOutcome,
      occurredAt,
    );
    const auditEvent = buildReturnAuditEnvelope(
      request,
      record,
      parsedOutcome,
      occurredAt,
      rawResponseXml,
    );

    await this.publishers.spool.publish(
      buildSubmissionPublishCommand(
        'spool',
        spoolUpdate,
        `${record.messageId}:return:${record.status}`,
      ),
    );
    await this.publishers.audit.publish(
      buildSubmissionPublishCommand(
        'audit',
        auditEvent,
        `${record.messageId}:return:audit`,
      ),
    );

    return {
      parsed: parsedOutcome.parsed,
      record,
      spoolUpdate,
      auditEvent,
    };
  }

  async publishMalformedToDlq(
    validation: Exclude<ReturnIngressValidationResult, { ok: true }>,
  ): Promise<void> {
    const occurredAt = this.now().toISOString();
    const envelope = buildReturnDlqEnvelope(
      validation.candidate,
      validation.error,
      occurredAt,
      validation.rawBody,
    );
    await this.publishers.dlq.publish(
      buildSubmissionPublishCommand('dlq', envelope, `${envelope['request-id']}:return:dlq`),
    );
  }

  private async parseAndClassify(
    environment: string,
    rawResponseXml: string,
    occurredAt: string,
  ): Promise<Readonly<{
    parsed: ParsedEsocialReturn | null;
    classification?: ReturnResponseClassification | undefined;
    status: EsocialStatus;
    errors: readonly EsocialContractError[];
    operatorActionRequired: boolean;
    auditFlags: readonly string[];
  }>> {
    try {
      const parsed = parseEsocialReturnXml(rawResponseXml);
      if (parsed.kind === 'soap_fault') {
        return {
          parsed,
          status: 'failed',
          operatorActionRequired: true,
          auditFlags: [],
          errors: [
            {
              category: 'transport',
              code: 'ESOCIAL_SOAP_FAULT',
              message: parsed.fault,
              retryable: false,
              occurred_at: occurredAt,
            },
          ],
        };
      }

      const classification = parsed.responseCode
        ? await this.repository.classifyResponseCode({
            environment,
            responseCode: parsed.responseCode,
          })
        : undefined;
      if (!classification) {
        return {
          parsed,
          status: 'failed',
          operatorActionRequired: true,
          auditFlags: ['unknown_regulatory_code'],
          errors: [
            {
              category: 'regulatory',
              code: 'ESOCIAL_RESPONSE_CODE_UNMAPPED',
              message: `No esocial.response_classification row maps code ${parsed.responseCode ?? 'UNKNOWN'}.`,
              retryable: false,
              occurred_at: occurredAt,
            },
            ...errorsFromParsedReturn(parsed, occurredAt),
          ],
        };
      }

      return {
        parsed,
        classification,
        status: statusFromClassification(classification),
        operatorActionRequired: classification.operatorActionRequired,
        auditFlags: [],
        errors: errorsFromParsedReturn(parsed, occurredAt, classification),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        parsed: null,
        status: 'failed',
        operatorActionRequired: true,
        auditFlags: [],
        errors: [
          {
            category: 'schema',
            code:
              error instanceof ReturnXmlParseError
                ? 'MALFORMED_XML'
                : 'ESOCIAL_RETURN_PARSE_FAILED',
            message,
            retryable: false,
            occurred_at: occurredAt,
          },
        ],
      };
    }
  }

  private async resolveOrigin(input: Readonly<{
    request: ReturnRequestEnvelope;
    payload: Record<string, unknown>;
    protocol?: string | undefined;
    receipt?: string | undefined;
    competence?: string | undefined;
  }>): Promise<ReturnOriginRecord> {
    const eventRecordId = stringValue(input.payload['eventRecordId']);
    const batchId = stringValue(input.payload['batchId']);
    const previousStatus = statusOrUndefined(input.payload['previousStatus']);
    const sourceEventClass = eventClassOrUndefined(input.payload['sourceEventClass']);

    if (eventRecordId && batchId) {
      return {
        eventRecordId,
        batchId,
        previousStatus,
        sourceEventClass,
        competence: input.competence,
      };
    }

    const resolved = await this.repository.resolveOrigin?.({
      tenantId: input.request.tenant_id,
      environment: input.request.environment,
      protocol: input.protocol,
      receipt: input.receipt,
    });

    if (resolved) {
      return {
        ...resolved,
        previousStatus: previousStatus ?? resolved.previousStatus,
        sourceEventClass: sourceEventClass ?? resolved.sourceEventClass,
        competence: input.competence ?? resolved.competence,
      };
    }

    throw new Error(
      "Return origin could not be resolved from payload['eventRecordId']/payload['batchId'] or protocol/receipt.",
    );
  }
}

export function validateReturnIngressEnvelope(
  candidate: unknown,
  rawBody?: string,
): ReturnIngressValidationResult {
  if (!isRecord(candidate)) {
    return ingressError('ESOCIAL_RETURN_NOT_OBJECT', 'Return body must be a JSON object.', candidate, rawBody);
  }

  if (candidate['version'] !== ESOCIAL_CONTRACT_VERSION) {
    return ingressError('ESOCIAL_UNSUPPORTED_VERSION', 'Unsupported eSocial envelope version.', candidate, rawBody);
  }
  if (candidate['family'] !== 'request') {
    return ingressError('ESOCIAL_UNSUPPORTED_FAMILY', 'Return handler accepts request envelopes only.', candidate, rawBody);
  }
  if (!isNonEmptyString(candidate['request-id'])) {
    return ingressError('ESOCIAL_REQUEST_ID_REQUIRED', 'request-id is required.', candidate, rawBody);
  }
  if (!isNonEmptyString(candidate['correlation-id'])) {
    return ingressError('ESOCIAL_CORRELATION_ID_REQUIRED', 'correlation-id is required.', candidate, rawBody);
  }
  if (!isNonEmptyString(candidate['idempotency-key'])) {
    return ingressError('ESOCIAL_IDEMPOTENCY_KEY_REQUIRED', 'idempotency-key is required.', candidate, rawBody);
  }
  if (!isUuid(candidate['tenant_id'])) {
    return ingressError('ESOCIAL_TENANT_UUID_REQUIRED', 'tenant_id must be a UUID for the current esocial schema.', candidate, rawBody);
  }
  if (!includesString(ESOCIAL_ENVIRONMENTS, candidate['environment'])) {
    return ingressError('ESOCIAL_ENVIRONMENT_INVALID', 'environment is not supported.', candidate, rawBody);
  }
  if (!includesString(ESOCIAL_RELAY_EVENT_CLASSES, candidate['event_class'])) {
    return ingressError('ESOCIAL_EVENT_CLASS_INVALID', 'event_class is not supported.', candidate, rawBody);
  }
  if (!includesString(ESOCIAL_CLASSES, candidate['kind']) || candidate['kind'] !== 'retorno') {
    return ingressError('ESOCIAL_RETURN_KIND_INVALID', 'return handler accepts kind retorno only.', candidate, rawBody);
  }
  if (!isRecord(candidate['source'])) {
    return ingressError('ESOCIAL_SOURCE_REQUIRED', 'source object is required.', candidate, rawBody);
  }
  if (!Number.isInteger(candidate['attempt']) || Number(candidate['attempt']) < 0) {
    return ingressError('ESOCIAL_ATTEMPT_INVALID', 'attempt must be a non-negative integer.', candidate, rawBody);
  }
  if (!Number.isInteger(candidate['max-attempts']) || Number(candidate['max-attempts']) < 1) {
    return ingressError('ESOCIAL_MAX_ATTEMPTS_INVALID', 'max-attempts must be a positive integer.', candidate, rawBody);
  }
  if (!isNonEmptyString(candidate['reply-to']) || !isNonEmptyString(candidate['dead-letter-topic'])) {
    return ingressError('ESOCIAL_TOPICS_REQUIRED', 'reply-to and dead-letter-topic are required.', candidate, rawBody);
  }
  if (!isNonEmptyString(candidate['payload_hash'])) {
    return ingressError('ESOCIAL_PAYLOAD_HASH_REQUIRED', 'payload_hash is required.', candidate, rawBody);
  }
  if (!isRecord(candidate['payload'])) {
    return ingressError('ESOCIAL_RETURN_PAYLOAD_REQUIRED', 'payload object is required.', candidate, rawBody);
  }
  if (!isNonEmptyString(candidate['payload']['rawResponseXml']) && !isNonEmptyString(candidate['payload']['responseXml'])) {
    return ingressError('ESOCIAL_RETURN_XML_REQUIRED', "payload['rawResponseXml'] is required.", candidate, rawBody);
  }
  const hasExplicitOrigin = isUuid(candidate['payload']['eventRecordId']) && isUuid(candidate['payload']['batchId']);
  const hasLookupOrigin =
    isNonEmptyString(candidate['payload']['protocolNumber'])
    || isNonEmptyString(candidate['payload']['receiptNumber']);
  if (!hasExplicitOrigin && !hasLookupOrigin) {
    return ingressError(
      'ESOCIAL_RETURN_ORIGIN_REQUIRED',
      'payload must include eventRecordId and batchId or protocolNumber/receiptNumber for origin lookup.',
      candidate,
      rawBody,
    );
  }
  if (candidate['payload']['eventRecordId'] !== undefined && !isUuid(candidate['payload']['eventRecordId'])) {
    return ingressError('ESOCIAL_RETURN_EVENT_RECORD_REQUIRED', "payload['eventRecordId'] must identify the esocial.event_record row.", candidate, rawBody);
  }
  if (candidate['payload']['batchId'] !== undefined && !isUuid(candidate['payload']['batchId'])) {
    return ingressError('ESOCIAL_RETURN_BATCH_REQUIRED', "payload['batchId'] must identify the esocial.submission_batch row.", candidate, rawBody);
  }

  return {
    ok: true,
    envelope: candidate as ReturnRequestEnvelope,
  };
}

function buildReturnSpoolUpdateEnvelope(
  request: ReturnRequestEnvelope,
  record: ReturnPersistenceRecord,
  parsedOutcome: Readonly<{
    parsed: ParsedEsocialReturn | null;
    classification?: ReturnResponseClassification | undefined;
    errors: readonly EsocialContractError[];
    operatorActionRequired: boolean;
    auditFlags: readonly string[];
  }>,
  occurredAt: string,
): SpoolUpdateEnvelope {
  return {
    version: 'v1',
    family: 'spool',
    'request-id': request['request-id'],
    'correlation-id': request['correlation-id'],
    'idempotency-key': request['idempotency-key'],
    created_at: occurredAt,
    message_id: record.messageId,
    tenant_id: request.tenant_id,
    environment: request.environment,
    event_class: record.totalizerClass ?? request.event_class,
    source: request.source,
    kind: 'retorno',
    status_transition: {
      from: record.previousStatus,
      to: record.status,
    },
    response_hash: record.responseHash,
    response_payload: {
      return_kind: parsedOutcome.parsed?.kind ?? 'malformed_xml',
      protocol_number: record.protocol,
      receipt_number: record.receipt,
      response_code: parsedOutcome.parsed?.responseCode,
      response_description: parsedOutcome.parsed?.responseDescription,
      classification: parsedOutcome.classification,
      operator_action_required: parsedOutcome.operatorActionRequired,
      audit_flags: parsedOutcome.auditFlags,
      batch_id: record.batchId,
      event_record_id: record.eventRecordId,
      totalizer_id: record.totalizerId,
      totalizer_class: record.totalizerClass,
      competence: record.competence,
    },
    errors: parsedOutcome.errors,
    occurred_at: occurredAt,
  };
}

function buildReturnAuditEnvelope(
  request: ReturnRequestEnvelope,
  record: ReturnPersistenceRecord,
  parsedOutcome: Readonly<{
    parsed: ParsedEsocialReturn | null;
    classification?: ReturnResponseClassification | undefined;
    errors: readonly EsocialContractError[];
    auditFlags: readonly string[];
  }>,
  occurredAt: string,
  rawResponseXml: string,
): AuditEventEnvelope {
  return {
    version: 'v1',
    family: 'audit',
    'request-id': request['request-id'],
    'correlation-id': request['correlation-id'],
    'idempotency-key': request['idempotency-key'],
    created_at: occurredAt,
    tenant_id: request.tenant_id,
    environment: request.environment,
    event_class: record.totalizerClass ?? request.event_class,
    source: request.source,
    actor_id: 'system:esocial-retorno',
    action:
      parsedOutcome.parsed?.kind === 'totalizer'
        ? 'return.totalizer.persisted'
        : `return.${record.status}`,
    status: record.status,
    target: {
      type: record.totalizerId ? 'esocial.esocial_totalizer' : 'esocial.event_record',
      id: record.totalizerId ?? record.eventRecordId,
    },
    after: {
      message_id: record.messageId,
      batch_id: record.batchId,
      event_record_id: record.eventRecordId,
      totalizer_id: record.totalizerId,
      protocol_number: record.protocol,
      receipt_number: record.receipt,
      response_sha256: record.responseHash,
      classification: parsedOutcome.classification,
      audit_flags: parsedOutcome.auditFlags,
      raw_response_ref: `local://esocial.submission_message/${record.messageId}/payload.raw_response_xml`,
      raw_response_bytes: rawResponseXml.length,
    },
    errors: parsedOutcome.errors,
    occurred_at: occurredAt,
  };
}

function buildReturnDlqEnvelope(
  candidate: Record<string, unknown> | undefined,
  error: EsocialContractError,
  occurredAt: string,
  rawBody?: string,
): EsocialDlqEnvelope & Readonly<{ malformed_body?: string | undefined }> {
  const requestId = stringValue(candidate?.['request-id']) ?? `malformed-return-${occurredAt}`;
  const correlationId = stringValue(candidate?.['correlation-id']) ?? requestId;
  const eventClass = includesString(ESOCIAL_RELAY_EVENT_CLASSES, candidate?.['event_class'])
    ? candidate['event_class']
    : FALLBACK_EVENT_CLASS;

  return {
    version: 'v1',
    family: 'dlq',
    'request-id': requestId,
    'correlation-id': correlationId,
    'idempotency-key': stringValue(candidate?.['idempotency-key']) ?? `malformed-return:${requestId}`,
    created_at: occurredAt,
    tenant_id: isUuid(candidate?.['tenant_id']) ? candidate['tenant_id'] : NIL_TENANT_ID,
    environment: includesString(ESOCIAL_ENVIRONMENTS, candidate?.['environment'])
      ? candidate['environment']
      : 'QUALIFICATION',
    event_class: eventClass,
    source: isRecord(candidate?.['source']) ? candidate['source'] : {},
    kind: 'retorno',
    status: 'dlq',
    final_attempt: Number.isInteger(candidate?.['attempt']) ? Number(candidate?.['attempt']) : 0,
    dlq_reason: error.message,
    failed_at: occurredAt,
    errors: [error],
    replay_topic: 'sgp.esocial.replay',
    malformed_body: rawBody,
  };
}

function statusFromClassification(
  classification: ReturnResponseClassification,
): EsocialStatus {
  switch (classification.canonicalStatus) {
    case 'ACCEPTED':
      return 'accepted';
    case 'REJECTED':
      return 'rejected';
    case 'RETRY':
      return 'retry';
    case 'TIMEOUT':
      return 'timeout';
    case 'DLQ':
    case 'OPERATOR_ACTION':
      return 'dlq';
    case 'FAILED':
      return 'failed';
  }
}

function errorsFromParsedReturn(
  parsed: ParsedEsocialReturn,
  occurredAt: string,
  classification?: ReturnResponseClassification,
): EsocialContractError[] {
  if (parsed.kind !== 'processing') {
    if (classification?.operatorActionRequired) {
      return [
            {
              category: 'regulatory',
              code: parsed.responseCode ?? 'ESOCIAL_RESPONSE_WITHOUT_CODE',
              message: classification.description,
              retryable: classification.retryable,
              occurred_at: occurredAt,
        },
      ];
    }
    return [];
  }

  const eventErrors = parsed.processingReturn.events.flatMap((eventReturn) =>
    eventReturn.errors.map((occurrence) => ({
      category: 'regulatory' as const,
      code: occurrence.code,
      message: occurrence.description,
      details: {
        event_reference: eventReturn.eventReference,
        response_code: eventReturn.responseCode,
        response_description: eventReturn.responseDescription,
        occurrence_type: occurrence.type,
        location: occurrence.location,
      },
      retryable: classification?.retryable ?? false,
      occurred_at: occurredAt,
    })),
  );

  if (eventErrors.length > 0) return eventErrors;
  if (!classification?.operatorActionRequired && classification?.canonicalStatus === 'ACCEPTED') {
    return [];
  }

  return [
    {
      category: 'regulatory',
      code: parsed.responseCode,
      message: parsed.responseDescription,
      retryable: classification?.retryable ?? false,
      occurred_at: occurredAt,
    },
  ];
}

function ingressError(
  code: string,
  message: string,
  candidate: unknown,
  rawBody?: string,
): ReturnIngressValidationResult {
  return {
    ok: false,
    error: {
      category: 'validation',
      code,
      message,
      retryable: false,
    },
    candidate: isRecord(candidate) ? candidate : undefined,
    rawBody,
  };
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringValue(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

function includesString<TValue extends string>(
  values: readonly TValue[],
  candidate: unknown,
): candidate is TValue {
  return typeof candidate === 'string' && values.includes(candidate as TValue);
}

function statusOrUndefined(value: unknown): EsocialStatus | undefined {
  const statuses: readonly EsocialStatus[] = [
    'pending',
    'building',
    'validation_failed',
    'signed',
    'sent',
    'accepted',
    'rejected',
    'retry',
    'timeout',
    'dlq',
    'excluded',
    'failed',
  ];
  return includesString(statuses, value) ? value : undefined;
}

function eventClassOrUndefined(
  value: unknown,
): EsocialRelayEventClass | undefined {
  return includesString(ESOCIAL_RELAY_EVENT_CLASSES, value) ? value : undefined;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
