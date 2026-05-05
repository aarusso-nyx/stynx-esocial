import {
  ESOCIAL_CLASSES,
  ESOCIAL_CONTRACT_VERSION,
  ESOCIAL_ENVIRONMENTS,
  ESOCIAL_RELAY_EVENT_CLASSES,
  validateEsocialSgpRequestDto,
} from '@esocial/contracts';
import type {
  AuditEventEnvelope,
  EsocialClass,
  EsocialContractError,
  EsocialRelayRequestPayload,
  EsocialStatus,
  QueueAdapterRequestEnvelope,
  QueueAdapterResponseEnvelope,
  SpoolUpdateEnvelope,
} from '@esocial/contracts';

import {
  buildSubmissionPublishCommand,
} from '../transport/submission-publishers.js';
import type {
  SubmissionDlqEnvelope,
  SubmissionPublishers,
} from '../transport/submission-publishers.js';

import { routeSubmissionEventClass } from './submission-router.js';
import type { SubmissionRoute } from './submission-router.js';

const NIL_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const FALLBACK_EVENT_CLASS = 'S-1299';

export type SubmissionRequestEnvelope =
  QueueAdapterRequestEnvelope<EsocialClass, EsocialRelayRequestPayload>;

export type SubmissionPersistenceStatus = Extract<
  EsocialStatus,
  'building' | 'validation_failed'
>;

export type SubmissionPersistenceRecord = Readonly<{
  inserted: boolean;
  messageId: string;
  batchId?: string | undefined;
  eventRecordId?: string | undefined;
  status: SubmissionPersistenceStatus;
  route: SubmissionRoute;
  createdAt: string;
  updatedAt: string;
  errors?: readonly EsocialContractError[] | undefined;
}>;

export type PersistSubmissionCommand = Readonly<{
  envelope: SubmissionRequestEnvelope;
  route: SubmissionRoute;
  status: SubmissionPersistenceStatus;
  occurredAt: string;
  errors?: readonly EsocialContractError[] | undefined;
}>;

export type SubmissionRepository = Readonly<{
  persist(command: PersistSubmissionCommand): Promise<SubmissionPersistenceRecord>;
}>;

export type SubmissionProcessorResult = Readonly<{
  record: SubmissionPersistenceRecord;
  response: QueueAdapterResponseEnvelope<EsocialClass>;
  spoolUpdate?: SpoolUpdateEnvelope | undefined;
  auditEvent: AuditEventEnvelope;
}>;

export type SubmissionIngressValidationResult =
  | Readonly<{
      ok: true;
      envelope: SubmissionRequestEnvelope;
    }>
  | Readonly<{
      ok: false;
      error: EsocialContractError;
      candidate?: Record<string, unknown> | undefined;
      rawBody?: string | undefined;
    }>;

export type SubmissionProcessorOptions = Readonly<{
  repository: SubmissionRepository;
  publishers: SubmissionPublishers;
  now?: (() => Date) | undefined;
}>;

export class RetryableSubmissionError extends Error {
  readonly errors: readonly EsocialContractError[];

  constructor(message: string, errors: readonly EsocialContractError[]) {
    super(message);
    this.name = 'RetryableSubmissionError';
    this.errors = errors;
  }
}

export class TerminalSubmissionError extends Error {
  readonly errors: readonly EsocialContractError[];

  constructor(message: string, errors: readonly EsocialContractError[]) {
    super(message);
    this.name = 'TerminalSubmissionError';
    this.errors = errors;
  }
}

export class SubmissionProcessor {
  private readonly repository: SubmissionRepository;
  private readonly publishers: SubmissionPublishers;
  private readonly now: () => Date;

  constructor(options: SubmissionProcessorOptions) {
    this.repository = options.repository;
    this.publishers = options.publishers;
    this.now = options.now ?? (() => new Date());
  }

  async process(request: SubmissionRequestEnvelope): Promise<SubmissionProcessorResult> {
    const occurredAt = this.now().toISOString();
    const route = routeSubmissionEventClass(request.event_class);
    const validationErrors = validateSubmissionPayload(request);
    const status: SubmissionPersistenceStatus =
      validationErrors.length > 0 ? 'validation_failed' : 'building';

    const record = await this.repository.persist({
      envelope: request,
      route,
      status,
      occurredAt,
      errors: validationErrors,
    });

    const response = buildResponseEnvelope(request, record, occurredAt);
    const auditEvent = buildAuditEnvelope(request, record, occurredAt);
    const spoolUpdate =
      record.status === 'building'
        ? buildSpoolUpdateEnvelope(request, record, occurredAt)
        : undefined;

    if (await this.publishResponse(request, response, occurredAt) === 'terminal') {
      return {
        record,
        response,
        spoolUpdate,
        auditEvent,
      };
    }

    if (spoolUpdate) {
      if (await this.publishSpool(request, spoolUpdate, occurredAt) === 'terminal') {
        return {
          record,
          response,
          spoolUpdate,
          auditEvent,
        };
      }
    }

    await this.publishAudit(request, auditEvent, occurredAt);

    return {
      record,
      response,
      spoolUpdate,
      auditEvent,
    };
  }

  async publishMalformedToDlq(
    validation: Exclude<SubmissionIngressValidationResult, { ok: true }>,
  ): Promise<void> {
    const occurredAt = this.now().toISOString();
    const envelope = buildDlqEnvelopeFromCandidate(
      validation.candidate,
      validation.error,
      occurredAt,
      validation.rawBody,
    );
    await this.publishers.dlq.publish(
      buildSubmissionPublishCommand('dlq', envelope, `${envelope['request-id']}:dlq`),
    );
  }

  async publishRetryForFailure(
    request: SubmissionRequestEnvelope,
    error: EsocialContractError,
  ): Promise<void> {
    const occurredAt = this.now().toISOString();
    const retry = {
      version: 'v1',
      family: 'retry',
      'request-id': request['request-id'],
      'correlation-id': request['correlation-id'],
      'idempotency-key': request['idempotency-key'],
      created_at: occurredAt,
      tenant_id: request.tenant_id,
      environment: request.environment,
      event_class: request.event_class,
      source: request.source,
      kind: request.kind,
      status: 'retry',
      attempt: request.attempt + 1,
      'max-attempts': request['max-attempts'],
      next_attempt_at: new Date(this.now().getTime() + 300_000).toISOString(),
      retry_reason: error.message,
      errors: [error],
    } as const;

    await this.publishers.retry.publish(
      buildSubmissionPublishCommand('retry', retry, `${request['request-id']}:retry`),
    );
  }

  async publishTerminalToDlq(
    request: SubmissionRequestEnvelope,
    errors: readonly EsocialContractError[],
  ): Promise<void> {
    const occurredAt = this.now().toISOString();
    const envelope = buildDlqEnvelopeFromRequest(request, errors, occurredAt);
    await this.publishers.dlq.publish(
      buildSubmissionPublishCommand('dlq', envelope, `${request['request-id']}:dlq`),
    );
  }

  private async publishResponse(
    request: SubmissionRequestEnvelope,
    response: QueueAdapterResponseEnvelope<EsocialClass>,
    occurredAt: string,
  ): Promise<'published' | 'terminal'> {
    return this.publishWithClassification(
      request,
      () =>
        this.publishers.response.publish(
          buildSubmissionPublishCommand('response', response, `${occurredAt}:response`),
        ),
      occurredAt,
    );
  }

  private async publishSpool(
    request: SubmissionRequestEnvelope,
    spoolUpdate: SpoolUpdateEnvelope,
    occurredAt: string,
  ): Promise<'published' | 'terminal'> {
    return this.publishWithClassification(
      request,
      () =>
        this.publishers.spool.publish(
          buildSubmissionPublishCommand('spool', spoolUpdate, `${occurredAt}:spool`),
        ),
      occurredAt,
    );
  }

  private async publishAudit(
    request: SubmissionRequestEnvelope,
    auditEvent: AuditEventEnvelope,
    occurredAt: string,
  ): Promise<'published' | 'terminal'> {
    return this.publishWithClassification(
      request,
      () =>
        this.publishers.audit.publish(
          buildSubmissionPublishCommand('audit', auditEvent, `${occurredAt}:audit`),
        ),
      occurredAt,
    );
  }

  private async publishWithClassification(
    request: SubmissionRequestEnvelope,
    publish: () => Promise<void>,
    occurredAt: string,
  ): Promise<'published' | 'terminal'> {
    try {
      await publish();
      return 'published';
    } catch (error) {
      if (error instanceof TerminalSubmissionError) {
        await this.publishTerminalToDlq(request, error.errors);
        return 'terminal';
      }

      const contractError = transportErrorFromUnknown(error, occurredAt);
      await this.publishRetryForFailure(request, contractError);
      throw new RetryableSubmissionError(contractError.message, [contractError]);
    }
  }
}

export function validateIngressEnvelope(
  candidate: unknown,
  rawBody?: string,
): SubmissionIngressValidationResult {
  if (!isRecord(candidate)) {
    return ingressError('ESOCIAL_REQUEST_NOT_OBJECT', 'Request body must be a JSON object.', candidate, rawBody);
  }

  if (candidate.version !== ESOCIAL_CONTRACT_VERSION) {
    return ingressError('ESOCIAL_UNSUPPORTED_VERSION', 'Unsupported eSocial envelope version.', candidate, rawBody);
  }

  if (candidate.family !== 'request') {
    return ingressError('ESOCIAL_UNSUPPORTED_FAMILY', 'Submission handler accepts request envelopes only.', candidate, rawBody);
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

  if (!isUuid(candidate.tenant_id)) {
    return ingressError('ESOCIAL_TENANT_UUID_REQUIRED', 'tenant_id must be a UUID for the current esocial schema.', candidate, rawBody);
  }

  if (!includesString(ESOCIAL_ENVIRONMENTS, candidate.environment)) {
    return ingressError('ESOCIAL_ENVIRONMENT_INVALID', 'environment is not supported.', candidate, rawBody);
  }

  if (!includesString(ESOCIAL_RELAY_EVENT_CLASSES, candidate.event_class)) {
    return ingressError('ESOCIAL_EVENT_CLASS_INVALID', 'event_class is not supported.', candidate, rawBody);
  }

  if (!includesString(ESOCIAL_CLASSES, candidate.kind)) {
    return ingressError('ESOCIAL_KIND_INVALID', 'kind is not supported.', candidate, rawBody);
  }

  if (!isRecord(candidate.source)) {
    return ingressError('ESOCIAL_SOURCE_REQUIRED', 'source object is required.', candidate, rawBody);
  }

  if (!Number.isInteger(candidate.attempt) || Number(candidate.attempt) < 0) {
    return ingressError('ESOCIAL_ATTEMPT_INVALID', 'attempt must be a non-negative integer.', candidate, rawBody);
  }

  if (!Number.isInteger(candidate['max-attempts']) || Number(candidate['max-attempts']) < 1) {
    return ingressError('ESOCIAL_MAX_ATTEMPTS_INVALID', 'max-attempts must be a positive integer.', candidate, rawBody);
  }

  if (!isNonEmptyString(candidate['reply-to']) || !isNonEmptyString(candidate['dead-letter-topic'])) {
    return ingressError('ESOCIAL_TOPICS_REQUIRED', 'reply-to and dead-letter-topic are required.', candidate, rawBody);
  }

  if (!isNonEmptyString(candidate.payload_hash)) {
    return ingressError('ESOCIAL_PAYLOAD_HASH_REQUIRED', 'payload_hash is required.', candidate, rawBody);
  }

  return {
    ok: true,
    envelope: candidate as SubmissionRequestEnvelope,
  };
}

function validateSubmissionPayload(
  request: SubmissionRequestEnvelope,
): readonly EsocialContractError[] {
  const payload = request.payload;
  const errors: EsocialContractError[] = [];

  if (!isRecord(payload)) {
    return [
      validationError('ESOCIAL_PAYLOAD_OBJECT_REQUIRED', 'payload must be an object.'),
    ];
  }

  const dtoValidation = validateEsocialSgpRequestDto(payload);
  if (!dtoValidation.ok) {
    errors.push(
      ...dtoValidation.errors.map((message) =>
        validationError('ESOCIAL_DTO_INVALID', message),
      ),
    );
  }

  const dtoEnvironment = dtoEnvironmentToEnvelope(payload.environment);
  if (dtoEnvironment && dtoEnvironment !== request.environment) {
    errors.push(
      validationError(
        'ESOCIAL_PAYLOAD_ENVIRONMENT_MISMATCH',
        'payload.environment must match envelope.environment.',
      ),
    );
  }

  if (payload.eventClass !== request.event_class) {
    errors.push(validationError('ESOCIAL_PAYLOAD_EVENT_CLASS_MISMATCH', 'payload.eventClass must match envelope.event_class.'));
  }

  return errors;
}

function dtoEnvironmentToEnvelope(candidate: unknown): SubmissionRequestEnvelope['environment'] | undefined {
  if (candidate === 'production') return 'PRODUCTION';
  if (candidate === 'qualification' || candidate === 'restricted_production') {
    return 'QUALIFICATION';
  }
  return undefined;
}

function buildResponseEnvelope(
  request: SubmissionRequestEnvelope,
  record: SubmissionPersistenceRecord,
  occurredAt: string,
): QueueAdapterResponseEnvelope<EsocialClass> {
  return {
    version: 'v1',
    family: 'response',
    'request-id': request['request-id'],
    'correlation-id': request['correlation-id'],
    'idempotency-key': request['idempotency-key'],
    created_at: occurredAt,
    tenant_id: request.tenant_id,
    environment: request.environment,
    event_class: request.event_class,
    source: request.source,
    kind: request.kind,
    status: record.status,
    attempt: request.attempt,
    processed_at: occurredAt,
    hashes: {
      request_sha256: request.payload_hash,
      payload_sha256: request.payload_hash,
    },
    payload: {
      message_id: record.messageId,
      batch_id: record.batchId,
      event_record_id: record.eventRecordId,
      route: record.route.name,
      stage: record.route.stage,
      duplicate: !record.inserted,
    },
    errors: record.errors,
  };
}

function buildSpoolUpdateEnvelope(
  request: SubmissionRequestEnvelope,
  record: SubmissionPersistenceRecord,
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
    event_class: request.event_class,
    source: request.source,
    kind: request.kind,
    status_transition: {
      from: 'pending',
      to: 'building',
    },
    occurred_at: occurredAt,
  };
}

function buildAuditEnvelope(
  request: SubmissionRequestEnvelope,
  record: SubmissionPersistenceRecord,
  occurredAt: string,
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
    event_class: request.event_class,
    source: request.source,
    actor_id: 'system:esocial-submission',
    action: record.inserted ? `submit.${record.status}` : 'submit.idempotent_reemit',
    status: record.status,
    target: {
      type: 'esocial.event_record',
      id: record.eventRecordId,
    },
    after: {
      message_id: record.messageId,
      batch_id: record.batchId,
      route: record.route.name,
      stage: record.route.stage,
    },
    errors: record.errors,
    occurred_at: occurredAt,
  };
}

function buildDlqEnvelopeFromRequest(
  request: SubmissionRequestEnvelope,
  errors: readonly EsocialContractError[],
  occurredAt: string,
): SubmissionDlqEnvelope {
  return {
    version: 'v1',
    family: 'dlq',
    'request-id': request['request-id'],
    'correlation-id': request['correlation-id'],
    'idempotency-key': request['idempotency-key'],
    created_at: occurredAt,
    tenant_id: request.tenant_id,
    environment: request.environment,
    event_class: request.event_class,
    source: request.source,
    kind: request.kind,
    status: 'dlq',
    final_attempt: request.attempt,
    dlq_reason: errors.map((error) => error.message).join('; '),
    failed_at: occurredAt,
    errors,
    replay_topic: 'sgp.esocial.replay',
  };
}

function buildDlqEnvelopeFromCandidate(
  candidate: Record<string, unknown> | undefined,
  error: EsocialContractError,
  occurredAt: string,
  rawBody?: string,
): SubmissionDlqEnvelope {
  const requestId = stringOr(candidate?.['request-id'], `malformed-${occurredAt}`);
  const correlationId = stringOr(candidate?.['correlation-id'], requestId);
  const tenantId = isUuid(candidate?.tenant_id) ? candidate.tenant_id : NIL_TENANT_ID;
  const eventClass = includesString(ESOCIAL_RELAY_EVENT_CLASSES, candidate?.event_class)
    ? candidate.event_class
    : FALLBACK_EVENT_CLASS;

  return {
    version: 'v1',
    family: 'dlq',
    'request-id': requestId,
    'correlation-id': correlationId,
    'idempotency-key': stringOr(candidate?.['idempotency-key'], `malformed:${requestId}`),
    created_at: occurredAt,
    tenant_id: tenantId,
    environment: includesString(ESOCIAL_ENVIRONMENTS, candidate?.environment)
      ? candidate.environment
      : 'QUALIFICATION',
    event_class: eventClass,
    source: isRecord(candidate?.source) ? candidate.source : {},
    kind: includesString(ESOCIAL_CLASSES, candidate?.kind) ? candidate.kind : 'submit',
    status: 'dlq',
    final_attempt: Number.isInteger(candidate?.attempt) ? Number(candidate?.attempt) : 0,
    dlq_reason: error.message,
    failed_at: occurredAt,
    errors: [error],
    replay_topic: 'sgp.esocial.replay',
    malformed_body: rawBody,
  };
}

function transportErrorFromUnknown(error: unknown, occurredAt: string): EsocialContractError {
  return {
    category: 'transport',
    code: 'ESOCIAL_OUTBOUND_PUBLISH_FAILED',
    message: error instanceof Error ? error.message : 'Outbound publish failed.',
    details: error instanceof Error ? { name: error.name } : undefined,
    retryable: true,
    occurred_at: occurredAt,
  };
}

function ingressError(
  code: string,
  message: string,
  candidate: unknown,
  rawBody?: string,
): SubmissionIngressValidationResult {
  return {
    ok: false,
    error: validationError(code, message),
    candidate: isRecord(candidate) ? candidate : undefined,
    rawBody,
  };
}

function validationError(code: string, message: string): EsocialContractError {
  return {
    category: 'validation',
    code,
    message,
    retryable: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function includesString<TValue extends string>(
  values: readonly TValue[],
  candidate: unknown,
): candidate is TValue {
  return typeof candidate === 'string' && values.includes(candidate as TValue);
}

function stringOr(value: unknown, fallback: string): string {
  return isNonEmptyString(value) ? value : fallback;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
