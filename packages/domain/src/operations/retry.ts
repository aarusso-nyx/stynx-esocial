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
  maxAttempts?: number;
  occurredAt: Date;
  error?: EsocialContractError;
  classification?: RetryFailureClassification;
  jitterSeed?: string;
  policy?: Partial<RetryPolicy>;
}>;

export type RetryDecision = Readonly<{
  action: 'retry' | 'dlq';
  classification: RetryFailureClassification;
  attempt: number;
  nextAttempt?: number;
  maxAttempts: number;
  budgetRemaining: number;
  delayMs?: number;
  nextAttemptAt?: string;
  retryable: boolean;
  reason: string;
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
  errorCode?: string;
  errorMessage: string;
  retryable: boolean;
  delayMs?: number;
  nextAttemptAt?: string;
}>;

export type RetrySchedulePersistenceCommand = Readonly<{
  tenantId: string;
  eventRecordId?: string;
  batchId?: string;
  environment: string;
  eventClass: string;
  nextAttemptAt: string;
  attemptCount: number;
  maxAttempts: number;
  budgetRemaining: number;
  lastClassification: RetryFailureClassification;
  lastErrorCode?: string;
  lastErrorMessage: string;
  status: 'SCHEDULED' | 'EXHAUSTED';
}>;

export type TerminalDlqPayload<TRequest extends QueueAdapterRequestEnvelope = QueueAdapterRequestEnvelope> =
  EsocialDlqEnvelope<TRequest['kind']> &
    Readonly<{
      original_envelope: TRequest;
      last_classification: RetryFailureClassification;
      attempt_history: readonly RetryAttemptEvidence[];
      hashes: {
        original_envelope_sha256: string;
        request_sha256?: string;
        payload_sha256?: string;
        signed_payload_sha256?: string;
        response_sha256?: string;
      };
      replay_hint: {
        replay_topic: string;
        schema_version: 'v1';
        idempotency_derivation: 'esocial:v1:replay:sha256(original-idempotency-key + replay-request-id)';
        eligible: boolean;
        reason?: string;
      };
    }>;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  budgets: {
    transport: 5,
    timeout: 5,
    internal: 3,
    authentication: 1,
    validation: 1,
    schema: 1,
    xml_build: 1,
    signing: 1,
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
  const currentAttempt = Math.max(0, Math.floor(input.attempt));
  const policyBudget = policy.budgets[classification];
  const maxAttempts =
    input.maxAttempts === undefined
      ? policyBudget
      : Math.max(0, Math.min(policyBudget, Math.floor(input.maxAttempts)));
  const retryable = isRetryable(input.error, classification);
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
  if (!error) return 'internal';

  if (/MALFORMED|NOT_OBJECT|UNSUPPORTED_VERSION|UNSUPPORTED_FAMILY/iu.test(error.code)) {
    return 'malformed';
  }
  if (/TIMEOUT|ETIMEDOUT|SOCKET_TIMEOUT/iu.test(error.code)) {
    return 'timeout';
  }

  return error.category;
}

export function calculateBackoffDelayMs(input: Readonly<{
  attempt: number;
  classification: RetryFailureClassification;
  jitterSeed?: string;
  policy?: RetryPolicy;
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
  eventRecordId?: string;
  batchId?: string;
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

export function buildTerminalDlqPayload<TRequest extends QueueAdapterRequestEnvelope>(
  input: Readonly<{
    request: TRequest;
    errors: readonly EsocialContractError[];
    occurredAt: string;
    finalAttempt?: number;
    lastClassification?: RetryFailureClassification;
    attemptHistory?: readonly RetryAttemptEvidence[];
    replayTopic?: string;
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
): boolean {
  if (error?.retryable !== undefined) return error.retryable;
  return classification === 'transport' ||
    classification === 'timeout' ||
    classification === 'internal';
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
