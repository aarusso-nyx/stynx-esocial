import { createHash } from 'node:crypto';

import type {
  EsocialContractError,
  EsocialDlqEnvelope,
  EsocialErrorCategory,
  QueueAdapterRequestEnvelope,
} from '@esocial/contracts';

export type RetryFailureClassification =
  | EsocialErrorCategory
  | 'malformed'
  | 'timeout';

export type RetryPolicy = Readonly<{
  budgets: Readonly<Record<RetryFailureClassification, number>>;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterRatio: number;
}>;

export type RetryDecisionInput = Readonly<{
  attempt: number;
  maxAttempts?: number | undefined;
  occurredAt: Date;
  error?: EsocialContractError | undefined;
  classification?: RetryFailureClassification | undefined;
  jitterSeed?: string | undefined;
  policy?: Partial<RetryPolicy> | undefined;
}>;

export type RetryDecision = Readonly<{
  action: 'retry' | 'dlq';
  classification: RetryFailureClassification;
  attempt: number;
  nextAttempt?: number | undefined;
  maxAttempts: number;
  budgetRemaining: number;
  delayMs?: number | undefined;
  nextAttemptAt?: string | undefined;
  retryable: boolean;
  reason: string;
}>;

export type RetryFailureClassificationDetail = Readonly<{
  category: RetryFailureClassification;
  retryable: boolean;
  budget: number;
}>;

export type ScheduledRetryDecision = RetryDecision &
  Readonly<{
    action: 'retry';
    nextAttempt: number;
    delayMs: number;
    nextAttemptAt: string;
  }>;

export type RetryAttemptEvidence = Readonly<{
  attempt: number;
  attemptedAt: string;
  classification: RetryFailureClassification;
  errorCode?: string | undefined;
  errorMessage: string;
  retryable: boolean;
  delayMs?: number | undefined;
  nextAttemptAt?: string | undefined;
}>;

export type RetrySchedulePersistenceCommand = Readonly<{
  tenantId: string;
  eventRecordId?: string | undefined;
  batchId?: string | undefined;
  environment: string;
  eventClass: string;
  nextAttemptAt: string;
  attemptCount: number;
  maxAttempts: number;
  budgetRemaining: number;
  lastClassification: RetryFailureClassification;
  lastErrorCode?: string | undefined;
  lastErrorMessage: string;
  status: 'SCHEDULED' | 'EXHAUSTED';
}>;

export type DlqItemPersistenceCommand = Readonly<{
  tenantId: string;
  messageId?: string | undefined;
  batchId?: string | undefined;
  eventRecordId?: string | undefined;
  environment: string;
  eventClass: string;
  originalEnvelope: QueueAdapterRequestEnvelope;
  lastClassification: RetryFailureClassificationDetail;
  attemptHistory: readonly RetryAttemptEvidence[];
  hashes: TerminalDlqPayload['hashes'];
  replayHint: TerminalDlqPayload['replay_hint'];
  status: 'OPEN';
}>;

export type RetryScheduleRecord<TRequest extends QueueAdapterRequestEnvelope = QueueAdapterRequestEnvelope> =
  Readonly<{
    retryScheduleId: string;
    tenantId: string;
    eventRecordId?: string | undefined;
    batchId?: string | undefined;
    environment: string;
    eventClass: string;
    attemptCount: number;
    maxAttempts: number;
    budgetRemaining: number;
    nextAttemptAt: string;
    lastClassification: RetryFailureClassification;
    lastErrorCode?: string | undefined;
    lastErrorMessage: string;
    originalEnvelope: TRequest;
  }>;

export type RetrySchedulePollerRepository<TRequest extends QueueAdapterRequestEnvelope = QueueAdapterRequestEnvelope> =
  Readonly<{
    claimDue(input: Readonly<{ now: string; limit: number }>): Promise<readonly RetryScheduleRecord<TRequest>[]>;
    markDispatched(input: Readonly<{ retryScheduleId: string; dispatchedAt: string; attempt: number }>): Promise<void>;
    defer(input: Readonly<{ retryScheduleId: string; nextAttemptAt: string; reason: string }>): Promise<void>;
    moveToDlq(input: Readonly<{
      retryScheduleId: string;
      dlq: TerminalDlqPayload<TRequest>;
      dlqItem: DlqItemPersistenceCommand;
    }>): Promise<void>;
  }>;

export type RetrySchedulePublisher<TRequest extends QueueAdapterRequestEnvelope = QueueAdapterRequestEnvelope> =
  Readonly<{
    publish(request: TRequest): Promise<void>;
  }>;

export type RetryScheduleCircuitGate<TRequest extends QueueAdapterRequestEnvelope = QueueAdapterRequestEnvelope> =
  Readonly<{
    shouldDefer(record: RetryScheduleRecord<TRequest>, now: Date): Promise<
      | Readonly<{ defer: false }>
      | Readonly<{ defer: true; nextAttemptAt: string; reason: string }>
    >;
  }>;

export type RetrySchedulePollerResult = Readonly<{
  claimed: number;
  dispatched: number;
  deferred: number;
  dlq: number;
}>;

export type TerminalDlqPayload<TRequest extends QueueAdapterRequestEnvelope = QueueAdapterRequestEnvelope> =
  EsocialDlqEnvelope<TRequest['kind']> &
    Readonly<{
      original_envelope: TRequest;
      last_classification: RetryFailureClassification;
      attempt_history: readonly RetryAttemptEvidence[];
      hashes: {
        original_envelope_sha256: string;
        request_sha256?: string | undefined;
        payload_sha256?: string | undefined;
        signed_payload_sha256?: string | undefined;
        response_sha256?: string | undefined;
      };
      replay_hint: {
        replay_topic: string;
        schema_version: 'v1';
        idempotency_derivation: 'esocial:v1:replay:sha256(original-idempotency-key + replay-request-id)';
        eligible: boolean;
        reason?: string | undefined;
      };
    }>;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  budgets: {
    transport: 5,
    timeout: 5,
    internal: 0,
    authentication: 1,
    validation: 0,
    schema: 0,
    xml_build: 0,
    signing: 0,
    malformed: 0,
    regulatory: 0,
    configuration: 0,
    idempotency: 0,
    totalizer_parse: 0,
  },
  baseDelayMs: 60_000,
  maxDelayMs: 900_000,
  multiplier: 2,
  jitterRatio: 0.2,
};

export function decideRetry(input: RetryDecisionInput): RetryDecision {
  const policy = normalizePolicy(input.policy);
  const classification =
    input.classification ?? classifyRetryFailure(input.error);
  const detail = classifyRetryFailureDetail(input.error, policy);
  const currentAttempt = Math.max(0, Math.floor(input.attempt));
  const policyBudget = policy.budgets[classification];
  const maxAttempts =
    input.maxAttempts === undefined
      ? policyBudget
      : Math.max(0, Math.min(policyBudget, Math.floor(input.maxAttempts)));
  const retryable = input.classification
    ? isRetryable(input.error, classification, policy)
    : detail.retryable;
  const budgetRemaining = Math.max(0, maxAttempts - currentAttempt);

  if (!retryable || budgetRemaining <= 0) {
    return {
      action: 'dlq',
      classification,
      attempt: currentAttempt,
      maxAttempts,
      budgetRemaining,
      retryable,
      reason: !retryable
        ? `${classification} failure is terminal.`
        : `${classification} retry budget exhausted.`,
    };
  }

  const delayMs = calculateBackoffDelayMs({
    attempt: currentAttempt,
    classification,
    jitterSeed: input.jitterSeed,
    policy,
  });
  const nextAttemptAt = new Date(input.occurredAt.getTime() + delayMs).toISOString();

  return {
    action: 'retry',
    classification,
    attempt: currentAttempt,
    nextAttempt: currentAttempt + 1,
    maxAttempts,
    budgetRemaining,
    delayMs,
    nextAttemptAt,
    retryable,
    reason: `${classification} failure scheduled for retry.`,
  };
}

export function classifyRetryFailure(
  error?: EsocialContractError,
): RetryFailureClassification {
  return classifyRetryFailureDetail(error).category;
}

export function classifyRetryFailureDetail(
  error?: EsocialContractError,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): RetryFailureClassificationDetail {
  if (!error) {
    return classificationDetail('internal', false, policy);
  }

  if (/MALFORMED|NOT_OBJECT|UNSUPPORTED_VERSION|UNSUPPORTED_FAMILY/iu.test(error.code)) {
    return classificationDetail('malformed', false, policy);
  }
  if (/TIMEOUT|ETIMEDOUT|SOCKET_TIMEOUT/iu.test(error.code)) {
    return classificationDetail('timeout', true, policy);
  }
  if (error.category === 'transport') {
    return classificationDetail('transport', true, policy);
  }
  if (
    error.category === 'authentication' ||
    /CERT|CERTIFICATE|EXPIRED|AUTH|UNAUTHORIZED|FORBIDDEN/iu.test(error.code)
  ) {
    return classificationDetail('authentication', true, policy);
  }

  return classificationDetail(error.category, false, policy);
}

export function calculateBackoffDelayMs(input: Readonly<{
  attempt: number;
  classification: RetryFailureClassification;
  jitterSeed?: string | undefined;
  policy?: RetryPolicy | undefined;
}>): number {
  const policy = input.policy ?? DEFAULT_RETRY_POLICY;
  const exponent = Math.max(0, input.attempt - 1);
  const rawDelay = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * (policy.multiplier ** exponent),
  );
  const seed = input.jitterSeed ?? `${input.classification}:${input.attempt}`;
  const centeredJitter = (hashFraction(seed) * 2) - 1;
  const multiplier = 1 + (centeredJitter * policy.jitterRatio);

  return Math.max(0, Math.round(rawDelay * multiplier));
}

export function buildRetryAttemptEvidence(input: Readonly<{
  decision: RetryDecision;
  error: EsocialContractError;
  attemptedAt: string;
}>): RetryAttemptEvidence {
  return {
    attempt: input.decision.attempt,
    attemptedAt: input.attemptedAt,
    classification: input.decision.classification,
    errorCode: input.error.code,
    errorMessage: input.error.message,
    retryable: input.decision.retryable && input.decision.action === 'retry',
    delayMs: input.decision.delayMs,
    nextAttemptAt: input.decision.nextAttemptAt,
  };
}

export function buildRetryScheduleCommand(input: Readonly<{
  request: QueueAdapterRequestEnvelope;
  eventRecordId?: string | undefined;
  batchId?: string | undefined;
  decision: ScheduledRetryDecision;
  error: EsocialContractError;
}>): RetrySchedulePersistenceCommand {
  return {
    tenantId: input.request.tenant_id,
    eventRecordId: input.eventRecordId,
    batchId: input.batchId,
    environment: input.request.environment,
    eventClass: input.request.event_class,
    nextAttemptAt: input.decision.nextAttemptAt,
    attemptCount: input.decision.attempt,
    maxAttempts: input.decision.maxAttempts,
    budgetRemaining: input.decision.budgetRemaining,
    lastClassification: input.decision.classification,
    lastErrorCode: input.error.code,
    lastErrorMessage: input.error.message,
    status: 'SCHEDULED',
  };
}

export function buildRetryDispatchRequest<TRequest extends QueueAdapterRequestEnvelope>(
  record: RetryScheduleRecord<TRequest>,
): TRequest {
  return {
    ...record.originalEnvelope,
    attempt: record.attemptCount + 1,
  } as TRequest;
}

export async function pollRetrySchedule<TRequest extends QueueAdapterRequestEnvelope>(
  input: Readonly<{
    repository: RetrySchedulePollerRepository<TRequest>;
    publisher: RetrySchedulePublisher<TRequest>;
    now?: Date | undefined;
    limit?: number | undefined;
    circuitGate?: RetryScheduleCircuitGate<TRequest> | undefined;
  }>,
): Promise<RetrySchedulePollerResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const records = await input.repository.claimDue({
    now: nowIso,
    limit: input.limit ?? 25,
  });
  let dispatched = 0;
  let deferred = 0;
  let dlq = 0;

  for (const record of records) {
    const gate = await input.circuitGate?.shouldDefer(record, now);
    if (gate?.defer) {
      await input.repository.defer({
        retryScheduleId: record.retryScheduleId,
        nextAttemptAt: gate.nextAttemptAt,
        reason: gate.reason,
      });
      deferred += 1;
      continue;
    }

    if (record.budgetRemaining <= 0 || record.attemptCount >= record.maxAttempts) {
      const error = retryRecordError(record, nowIso);
      const decision = decideRetry({
        attempt: record.attemptCount,
        maxAttempts: record.maxAttempts,
        occurredAt: now,
        error,
        classification: record.lastClassification,
      });
      const evidence = buildRetryAttemptEvidence({
        decision,
        error,
        attemptedAt: nowIso,
      });
      const terminal = buildTerminalDlqPayload({
        request: record.originalEnvelope,
        errors: [error],
        occurredAt: nowIso,
        finalAttempt: record.attemptCount,
        lastClassification: record.lastClassification,
        attemptHistory: [evidence],
      });
      await input.repository.moveToDlq({
        retryScheduleId: record.retryScheduleId,
        dlq: terminal,
        dlqItem: buildDlqItemPersistenceCommand({
          dlq: terminal,
          messageId: undefined,
          batchId: record.batchId,
          eventRecordId: record.eventRecordId,
        }),
      });
      dlq += 1;
      continue;
    }

    const retryRequest = buildRetryDispatchRequest(record);
    await input.publisher.publish(retryRequest);
    await input.repository.markDispatched({
      retryScheduleId: record.retryScheduleId,
      dispatchedAt: nowIso,
      attempt: retryRequest.attempt,
    });
    dispatched += 1;
  }

  return {
    claimed: records.length,
    dispatched,
    deferred,
    dlq,
  };
}

export function buildDlqItemPersistenceCommand<TRequest extends QueueAdapterRequestEnvelope>(
  input: Readonly<{
    dlq: TerminalDlqPayload<TRequest>;
    messageId?: string | undefined;
    batchId?: string | undefined;
    eventRecordId?: string | undefined;
  }>,
): DlqItemPersistenceCommand {
  return {
    tenantId: input.dlq.tenant_id,
    messageId: input.messageId,
    batchId: input.batchId,
    eventRecordId: input.eventRecordId,
    environment: input.dlq.environment,
    eventClass: input.dlq.event_class,
    originalEnvelope: input.dlq.original_envelope,
    lastClassification: classifyRetryFailureDetail(input.dlq.errors[0]),
    attemptHistory: input.dlq.attempt_history,
    hashes: input.dlq.hashes,
    replayHint: input.dlq.replay_hint,
    status: 'OPEN',
  };
}

export function buildTerminalDlqPayload<TRequest extends QueueAdapterRequestEnvelope>(
  input: Readonly<{
    request: TRequest;
    errors: readonly EsocialContractError[];
    occurredAt: string;
    finalAttempt?: number | undefined;
    lastClassification?: RetryFailureClassification | undefined;
    attemptHistory?: readonly RetryAttemptEvidence[] | undefined;
    replayTopic?: string | undefined;
  }>,
): TerminalDlqPayload<TRequest> {
  const primaryError = input.errors[0];
  const classification =
    input.lastClassification ?? classifyRetryFailure(primaryError);
  const replayTopic = input.replayTopic ?? 'sgp.esocial.replay';

  return {
    version: 'v1',
    family: 'dlq',
    'request-id': input.request['request-id'],
    'correlation-id': input.request['correlation-id'],
    'idempotency-key': input.request['idempotency-key'],
    created_at: input.occurredAt,
    tenant_id: input.request.tenant_id,
    environment: input.request.environment,
    event_class: input.request.event_class,
    source: input.request.source,
    kind: input.request.kind,
    status: 'dlq',
    final_attempt: input.finalAttempt ?? input.request.attempt,
    dlq_reason: input.errors.map((error) => error.message).join('; '),
    failed_at: input.occurredAt,
    errors: input.errors,
    replay_topic: replayTopic,
    original_envelope: input.request,
    last_classification: classification,
    attempt_history: input.attemptHistory ?? [],
    hashes: {
      original_envelope_sha256: sha256Prefixed(canonicalJson(input.request)),
      request_sha256: input.request.payload_hash,
      payload_sha256: input.request.payload_hash,
      signed_payload_sha256: signedPayloadSha256(input.request.payload),
    },
    replay_hint: {
      replay_topic: replayTopic,
      schema_version: 'v1',
      idempotency_derivation: 'esocial:v1:replay:sha256(original-idempotency-key + replay-request-id)',
      eligible: true,
    },
  };
}

function normalizePolicy(policy?: Partial<RetryPolicy>): RetryPolicy {
  return {
    ...DEFAULT_RETRY_POLICY,
    ...policy,
    budgets: {
      ...DEFAULT_RETRY_POLICY.budgets,
      ...policy?.budgets,
    },
  };
}

function isRetryable(
  error: EsocialContractError | undefined,
  classification: RetryFailureClassification,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): boolean {
  if (error?.retryable !== undefined && error.retryable === false) {
    return false;
  }
  const detail = classifyRetryFailureDetail(error, policy);
  if (detail.category === classification) return detail.retryable;
  return classification === 'transport' ||
    classification === 'timeout' ||
    classification === 'authentication';
}

function classificationDetail(
  category: RetryFailureClassification,
  retryable: boolean,
  policy: RetryPolicy,
): RetryFailureClassificationDetail {
  return {
    category,
    retryable,
    budget: retryable ? policy.budgets[category] : 0,
  };
}

function retryRecordError(
  record: RetryScheduleRecord,
  occurredAt: string,
): EsocialContractError {
  return {
    category: record.lastClassification === 'timeout'
      ? 'transport'
      : record.lastClassification as EsocialErrorCategory,
    code: record.lastErrorCode ?? 'ESOCIAL_RETRY_BUDGET_EXHAUSTED',
    message: record.lastErrorMessage,
    retryable: false,
    occurred_at: occurredAt,
  };
}

function hashFraction(seed: string): number {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 12);
  return Number.parseInt(hex, 16) / 0xffffffffffff;
}

function sha256Prefixed(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function signedPayloadSha256(payload: unknown): string | undefined {
  const record = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const signedEnvelope = typeof record.signedEnvelope === 'object' &&
    record.signedEnvelope !== null &&
    !Array.isArray(record.signedEnvelope)
    ? record.signedEnvelope as Record<string, unknown>
    : {};

  return typeof signedEnvelope.pkcs7Sha256 === 'string'
    ? signedEnvelope.pkcs7Sha256
    : undefined;
}
