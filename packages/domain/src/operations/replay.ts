import { createHash, randomUUID } from 'node:crypto';

import {
  ESOCIAL_CONTRACT_VERSION,
} from '@esocial/contracts';
import type {
  AuditEventEnvelope,
  EsocialDlqEnvelope,
  QueueAdapterRequestEnvelope,
} from '@esocial/contracts';

import {
  classifyRetryFailure,
} from './retry.js';
import type {
  RetryFailureClassification,
  TerminalDlqPayload,
} from './retry.js';

export type ReplayableDlqPayload<TRequest extends QueueAdapterRequestEnvelope = QueueAdapterRequestEnvelope> =
  (TerminalDlqPayload<TRequest> | EsocialDlqEnvelope<TRequest['kind']>) &
    Readonly<{
      original_envelope?: TRequest | undefined;
      last_classification?: RetryFailureClassification | undefined;
      replay_hint?: {
        schema_version?: string | undefined;
        eligible?: boolean | undefined;
        reason?: string | undefined;
      };
    }>;

export type DlqListFilters = Readonly<{
  tenantId?: string | undefined;
  eventClass?: string | undefined;
  classification?: RetryFailureClassification | undefined;
}>;

export type ReplayRequestResult<TRequest extends QueueAdapterRequestEnvelope = QueueAdapterRequestEnvelope> =
  Readonly<{
    request: TRequest;
    auditEvent: AuditEventEnvelope;
    originalRequest: TRequest;
  }>;

export type ReplayClashDecision = Readonly<
  | {
      action: 'allow';
      reason: string;
    }
  | {
      action: 'refuse';
      reason: string;
      completedIdempotencyKey: string;
    }
>;

export class ReplaySchemaMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplaySchemaMismatchError';
  }
}

export function listDlqMessages<TPayload extends ReplayableDlqPayload>(
  messages: readonly TPayload[],
  filters: DlqListFilters = {},
): readonly TPayload[] {
  return messages.filter((message) => {
    if (filters.tenantId && message.tenant_id !== filters.tenantId) return false;
    if (filters.eventClass && message.event_class !== filters.eventClass) return false;
    if (filters.classification && dlqClassification(message) !== filters.classification) {
      return false;
    }
    return true;
  });
}

export function buildReplayRequestFromDlq<TRequest extends QueueAdapterRequestEnvelope>(
  input: Readonly<{
    dlq: ReplayableDlqPayload<TRequest>;
    replayedBy: string;
    replayReason: string;
    now?: Date | undefined;
    uuid?: (() => string) | undefined;
  }>,
): ReplayRequestResult<TRequest> {
  const original = assertReplayCompatible(input.dlq);
  const uuid = input.uuid ?? randomUUID;
  const now = input.now ?? new Date();
  const replayRequestId = uuid();
  const replayCorrelationId = uuid();
  const replayIdempotencyKey = deriveReplayIdempotencyKey(
    original['idempotency-key'],
    replayRequestId,
  );
  const request = {
    ...original,
    'request-id': replayRequestId,
    'correlation-id': replayCorrelationId,
    'idempotency-key': replayIdempotencyKey,
    created_at: now.toISOString(),
    attempt: 1,
  } as TRequest;

  const auditEvent: AuditEventEnvelope = {
    version: ESOCIAL_CONTRACT_VERSION,
    family: 'audit',
    'request-id': replayRequestId,
    'correlation-id': replayCorrelationId,
    'idempotency-key': replayIdempotencyKey,
    created_at: now.toISOString(),
    tenant_id: original.tenant_id,
    environment: original.environment,
    event_class: original.event_class,
    source: original.source,
    actor_id: input.replayedBy,
    action: 'dlq.replay.requested',
    status: 'pending',
    target: {
      type: 'esocial.dlq',
      id: input.dlq['request-id'],
    },
    before: {
      original_request_id: original['request-id'],
      original_correlation_id: original['correlation-id'],
      original_idempotency_key: original['idempotency-key'],
      final_attempt: input.dlq.final_attempt,
      last_classification: dlqClassification(input.dlq),
      dlq_reason: input.dlq.dlq_reason,
    },
    after: {
      replay_request_id: replayRequestId,
      replay_correlation_id: replayCorrelationId,
      replay_idempotency_key: replayIdempotencyKey,
      replay_reason: input.replayReason,
      idempotency_derivation: 'esocial:v1:replay:sha256(original-idempotency-key + replay-request-id)',
    },
    errors: input.dlq.errors,
    occurred_at: now.toISOString(),
  };

  return {
    request,
    auditEvent,
    originalRequest: original,
  };
}

export function deriveReplayIdempotencyKey(
  originalIdempotencyKey: string,
  replayRequestId: string,
): string {
  return `esocial:v1:replay:${createHash('sha256')
    .update(`${originalIdempotencyKey}:${replayRequestId}`)
    .digest('hex')}`;
}

export function decideReplayClash(input: Readonly<{
  originalIdempotencyKey: string;
  completedIdempotencyKeys: readonly string[];
  force?: boolean | undefined;
}>): ReplayClashDecision {
  if (input.force) {
    return {
      action: 'allow',
      reason: 'force=true bypassed completed idempotency-key clash protection.',
    };
  }
  const completed = input.completedIdempotencyKeys.find(
    (value) => value === input.originalIdempotencyKey,
  );
  if (completed) {
    return {
      action: 'refuse',
      reason: 'Original idempotency key has a completed run; replay requires force=true.',
      completedIdempotencyKey: completed,
    };
  }
  return {
    action: 'allow',
    reason: 'No completed run uses the original idempotency key.',
  };
}

export function assertReplayCompatible<TRequest extends QueueAdapterRequestEnvelope>(
  dlq: ReplayableDlqPayload<TRequest>,
): TRequest {
  if (dlq.replay_hint?.eligible === false) {
    throw new ReplaySchemaMismatchError(
      `DLQ payload is not replayable: ${dlq.replay_hint.reason ?? 'no reason supplied'}.`,
    );
  }
  if (dlq.replay_hint?.schema_version &&
      dlq.replay_hint.schema_version !== ESOCIAL_CONTRACT_VERSION) {
    throw new ReplaySchemaMismatchError(
      `DLQ schema ${dlq.replay_hint.schema_version} is incompatible with ${ESOCIAL_CONTRACT_VERSION}.`,
    );
  }
  if (!dlq.original_envelope) {
    throw new ReplaySchemaMismatchError('DLQ payload does not carry original_envelope.');
  }
  if (dlq.original_envelope.version !== ESOCIAL_CONTRACT_VERSION) {
    throw new ReplaySchemaMismatchError(
      `Original envelope version ${dlq.original_envelope.version} is incompatible with ${ESOCIAL_CONTRACT_VERSION}.`,
    );
  }
  if (dlq.original_envelope.family !== 'request') {
    throw new ReplaySchemaMismatchError('Original envelope is not a request envelope.');
  }
  if (dlq.original_envelope.tenant_id !== dlq.tenant_id ||
      dlq.original_envelope.event_class !== dlq.event_class) {
    throw new ReplaySchemaMismatchError(
      'DLQ envelope tenant/event class does not match original_envelope.',
    );
  }

  return dlq.original_envelope;
}

function dlqClassification(
  dlq: ReplayableDlqPayload,
): RetryFailureClassification {
  return dlq.last_classification ?? classifyRetryFailure(dlq.errors[0]);
}
