import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  buildCircuitBreakerAuditCommand,
  buildDlqItemPersistenceCommand,
  buildReplayRequestFromDlq,
  buildRetryAttemptEvidence,
  buildRetryDispatchRequest,
  buildRetryScheduleCommand,
  buildTerminalDlqPayload,
  calculateBackoffDelayMs,
  classifyRetryFailure,
  classifyRetryFailureDetail,
  decideCircuitBreakerState,
  decideReplayClash,
  decideRetry,
  deriveReplayIdempotencyKey,
  listDlqMessages,
  pollRetrySchedule,
  recordCircuitBreakerOutcome,
  recordCircuitBreakerOutcomeWithAudit,
} from '../../packages/domain/dist/index.js';

const now = new Date('2026-05-06T12:00:00.000Z');

test('circuit breaker decisions defer open circuits and audit state transitions', () => {
  const base = circuitSnapshot({
    state: 'OPEN',
    failureCount: 3,
    openedAt: '2026-05-06T11:59:00.000Z',
  });

  assert.deepEqual(
    decideCircuitBreakerState({
      snapshot: base,
      now,
      policy: { openCooldownMs: 120_000 },
    }),
    {
      action: 'defer',
      state: 'OPEN',
      reason: 'Circuit is open; submission is deferred.',
      nextCheckAt: '2026-05-06T12:01:00.000Z',
    },
  );

  assert.deepEqual(
    decideCircuitBreakerState({
      snapshot: base,
      now,
      policy: { openCooldownMs: 30_000 },
    }),
    {
      action: 'allow',
      state: 'HALF_OPEN',
      reason: 'Circuit cooldown elapsed; allowing half-open probe.',
    },
  );

  const failed = recordCircuitBreakerOutcome({
    snapshot: circuitSnapshot({ state: 'CLOSED', failureCount: 2 }),
    outcome: 'failure',
    now,
    errorCode: 'ESOCIAL_SOAP_TIMEOUT',
  });
  assert.equal(failed.state, 'OPEN');
  assert.equal(failed.failureCount, 3);
  assert.equal(failed.lastErrorCode, 'ESOCIAL_SOAP_TIMEOUT');

  const closed = recordCircuitBreakerOutcomeWithAudit({
    snapshot: circuitSnapshot({
      state: 'HALF_OPEN',
      failureCount: 1,
      successCount: 0,
      halfOpenedAt: '2026-05-06T11:59:30.000Z',
    }),
    outcome: 'success',
    now,
  });
  assert.equal(closed.snapshot.state, 'CLOSED');
  assert.equal(closed.audit?.fromState, 'HALF_OPEN');
  assert.equal(closed.audit?.toState, 'CLOSED');
  assert.equal(closed.audit?.reason, 'half-open probe succeeded');

  assert.deepEqual(
    buildCircuitBreakerAuditCommand({
      from: circuitSnapshot({ state: 'CLOSED' }),
      to: failed,
      reason: 'explicit test reason',
      occurredAt: now.toISOString(),
    }),
    {
      tenantId: 'tenant-1',
      environment: 'QUALIFICATION',
      endpointName: 'enviar-lote',
      endpointUrl: 'https://soap.example.test/enviar',
      fromState: 'CLOSED',
      toState: 'OPEN',
      reason: 'explicit test reason',
      occurredAt: now.toISOString(),
      failureCount: 3,
      successCount: 0,
      errorCode: 'ESOCIAL_SOAP_TIMEOUT',
    },
  );
});

test('retry helpers classify failures, schedule retries, and build terminal DLQ evidence', () => {
  const timeoutError = contractError({
    category: 'transport',
    code: 'SOCKET_TIMEOUT',
    message: 'socket timed out',
    retryable: true,
  });
  const malformed = contractError({
    category: 'validation',
    code: 'MALFORMED_JSON',
    message: 'body was malformed',
  });
  const policy = {
    budgets: { transport: 3, timeout: 2, authentication: 1 },
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    multiplier: 2,
    jitterRatio: 0,
  };

  assert.equal(classifyRetryFailure(timeoutError), 'timeout');
  assert.deepEqual(classifyRetryFailureDetail(malformed), {
    category: 'malformed',
    retryable: false,
    budget: 0,
  });
  assert.equal(calculateBackoffDelayMs({
    attempt: 2,
    classification: 'transport',
    policy,
  }), 2_000);

  const decision = decideRetry({
    attempt: 1,
    occurredAt: now,
    error: timeoutError,
    jitterSeed: 'fixed',
    policy,
  });
  assert.equal(decision.action, 'retry');
  assert.equal(decision.nextAttempt, 2);
  assert.equal(decision.delayMs, 1_000);
  assert.equal(decision.nextAttemptAt, '2026-05-06T12:00:01.000Z');

  const terminal = decideRetry({
    attempt: 1,
    occurredAt: now,
    error: malformed,
  });
  assert.equal(terminal.action, 'dlq');
  assert.equal(terminal.reason, 'malformed failure is terminal.');

  const request = requestEnvelope({ attempt: 1 });
  const evidence = buildRetryAttemptEvidence({
    decision,
    error: timeoutError,
    attemptedAt: now.toISOString(),
  });
  assert.equal(evidence.retryable, true);

  const scheduled = buildRetryScheduleCommand({
    request,
    eventRecordId: 'event-1',
    batchId: 'batch-1',
    decision,
    error: timeoutError,
  });
  assert.equal(scheduled.status, 'SCHEDULED');
  assert.equal(scheduled.eventClass, 'S-1299');

  const dlq = buildTerminalDlqPayload({
    request,
    errors: [timeoutError],
    occurredAt: now.toISOString(),
    finalAttempt: 2,
    lastClassification: 'timeout',
    attemptHistory: [evidence],
  });
  assert.equal(dlq.family, 'dlq');
  assert.equal(dlq.last_classification, 'timeout');
  assert.equal(dlq.hashes.request_sha256, request.payload_hash);
  assert.equal(dlq.hashes.signed_payload_sha256, 'sha256:signed');

  const dlqItem = buildDlqItemPersistenceCommand({
    dlq,
    messageId: 'message-1',
    batchId: 'batch-1',
    eventRecordId: 'event-1',
  });
  assert.equal(dlqItem.status, 'OPEN');
  assert.equal(dlqItem.lastClassification.category, 'timeout');

  assert.equal(buildRetryDispatchRequest({
    retryScheduleId: 'retry-1',
    tenantId: request.tenant_id,
    environment: request.environment,
    eventClass: request.event_class,
    attemptCount: 2,
    maxAttempts: 3,
    budgetRemaining: 1,
    nextAttemptAt: now.toISOString(),
    lastClassification: 'transport',
    lastErrorMessage: 'retry me',
    originalEnvelope: request,
  }).attempt, 3);
});

test('retry poller dispatches, defers, and moves exhausted records to DLQ', async () => {
  const records = [
    retryRecord('retry-defer', { attemptCount: 1, budgetRemaining: 2 }),
    retryRecord('retry-dlq', { attemptCount: 3, maxAttempts: 3, budgetRemaining: 0 }),
    retryRecord('retry-dispatch', { attemptCount: 1, budgetRemaining: 2 }),
  ];
  const repository = new RecordingRetryRepository(records);
  const published = [];

  const result = await pollRetrySchedule({
    repository,
    publisher: {
      publish: async (request) => {
        published.push(request);
      },
    },
    now,
    limit: 10,
    circuitGate: {
      shouldDefer: async (record) =>
        record.retryScheduleId === 'retry-defer'
          ? {
              defer: true,
              nextAttemptAt: '2026-05-06T12:05:00.000Z',
              reason: 'circuit open',
            }
          : { defer: false },
    },
  });

  assert.deepEqual(result, {
    claimed: 3,
    dispatched: 1,
    deferred: 1,
    dlq: 1,
  });
  assert.equal(repository.deferred[0]?.reason, 'circuit open');
  assert.equal(repository.dlqMoves[0]?.dlq.status, 'dlq');
  assert.equal(repository.dispatched[0]?.attempt, 2);
  assert.equal(published[0]?.attempt, 2);
});

test('replay helpers filter DLQ messages and create deterministic replay requests', () => {
  const original = requestEnvelope({
    requestId: 'original-request',
    idempotencyKey: 'original-idempotency',
  });
  const dlq = buildTerminalDlqPayload({
    request: original,
    errors: [contractError({ category: 'transport', code: 'ETIMEDOUT' })],
    occurredAt: now.toISOString(),
    lastClassification: 'transport',
  });
  const regulatoryDlq = {
    ...dlq,
    event_class: 'S-5011',
    last_classification: 'regulatory',
    original_envelope: {
      ...original,
      event_class: 'S-5011',
    },
  };

  assert.deepEqual(listDlqMessages([dlq, regulatoryDlq], {
    tenantId: original.tenant_id,
    eventClass: 'S-1299',
    classification: 'transport',
  }), [dlq]);

  assert.deepEqual(decideReplayClash({
    originalIdempotencyKey: 'original-idempotency',
    completedIdempotencyKeys: ['original-idempotency'],
  }), {
    action: 'refuse',
    reason: 'Original idempotency key has a completed run; replay requires force=true.',
    completedIdempotencyKey: 'original-idempotency',
  });

  assert.equal(decideReplayClash({
    originalIdempotencyKey: 'original-idempotency',
    completedIdempotencyKeys: ['original-idempotency'],
    force: true,
  }).action, 'allow');

  const replay = buildReplayRequestFromDlq({
    dlq,
    replayedBy: 'operator-1',
    replayReason: 'operator requested replay after transport recovery',
    now,
    uuid: sequentialUuid(['replay-request', 'replay-correlation']),
  });
  assert.equal(replay.request['request-id'], 'replay-request');
  assert.equal(replay.request['correlation-id'], 'replay-correlation');
  assert.equal(
    replay.request['idempotency-key'],
    deriveReplayIdempotencyKey('original-idempotency', 'replay-request'),
  );
  assert.equal(replay.auditEvent.action, 'dlq.replay.requested');
  assert.equal(replay.auditEvent.target.id, dlq['request-id']);

  assert.throws(
    () => buildReplayRequestFromDlq({
      dlq: {
        ...dlq,
        replay_hint: {
          ...dlq.replay_hint,
          eligible: false,
          reason: 'manual block',
        },
      },
      replayedBy: 'operator-1',
      replayReason: 'blocked',
    }),
    /not replayable: manual block/u,
  );

  assert.throws(
    () => buildReplayRequestFromDlq({
      dlq: {
        ...dlq,
        replay_hint: {
          ...dlq.replay_hint,
          schema_version: 'v0',
        },
      },
      replayedBy: 'operator-1',
      replayReason: 'schema mismatch',
    }),
    /DLQ schema v0 is incompatible/u,
  );
});

function circuitSnapshot(overrides = {}) {
  return {
    tenantId: 'tenant-1',
    environment: 'QUALIFICATION',
    endpointName: 'enviar-lote',
    endpointUrl: 'https://soap.example.test/enviar',
    state: 'CLOSED',
    failureCount: 0,
    successCount: 0,
    ...overrides,
  };
}

function contractError(overrides = {}) {
  return {
    category: 'transport',
    code: 'ESOCIAL_TRANSPORT_ERROR',
    message: 'transport failed',
    retryable: true,
    occurred_at: now.toISOString(),
    ...overrides,
  };
}

function requestEnvelope(overrides = {}) {
  const payload = {
    eventClass: 'S-1299',
    signedEnvelope: {
      pkcs7Sha256: 'sha256:signed',
    },
  };
  return {
    version: 'v1',
    family: 'request',
    'request-id': overrides.requestId ?? 'request-1',
    'correlation-id': overrides.correlationId ?? 'correlation-1',
    'idempotency-key': overrides.idempotencyKey ?? 'idempotency-1',
    created_at: '2026-05-06T11:59:00.000Z',
    tenant_id: 'tenant-1',
    environment: 'QUALIFICATION',
    event_class: 'S-1299',
    source: {
      payroll_run_id: 'payroll-2026-05',
      source_system: 'sgp',
    },
    kind: 'submit',
    payload,
    payload_hash: `sha256:${createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')}`,
    attempt: overrides.attempt ?? 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.submit.response',
    'dead-letter-topic': 'sgp.esocial.dlq',
    ...withoutAliasOverrides(overrides),
  };
}

function retryRecord(retryScheduleId, overrides = {}) {
  const request = requestEnvelope({
    requestId: `${retryScheduleId}-request`,
    attempt: overrides.attemptCount ?? 1,
  });
  return {
    retryScheduleId,
    tenantId: request.tenant_id,
    eventRecordId: `${retryScheduleId}-event`,
    batchId: `${retryScheduleId}-batch`,
    environment: request.environment,
    eventClass: request.event_class,
    attemptCount: 1,
    maxAttempts: 3,
    budgetRemaining: 2,
    nextAttemptAt: now.toISOString(),
    lastClassification: 'transport',
    lastErrorCode: 'ESOCIAL_TRANSPORT_ERROR',
    lastErrorMessage: 'transport failed',
    originalEnvelope: request,
    ...overrides,
  };
}

function withoutAliasOverrides(overrides) {
  const rest = { ...overrides };
  delete rest.attempt;
  delete rest.correlationId;
  delete rest.idempotencyKey;
  delete rest.requestId;
  return rest;
}

function sequentialUuid(values) {
  let index = 0;
  return () => values[index++] ?? `uuid-${index}`;
}

class RecordingRetryRepository {
  deferred = [];
  dispatched = [];
  dlqMoves = [];

  constructor(records) {
    this.records = records;
  }

  async claimDue(input) {
    this.claimInput = input;
    return this.records;
  }

  async markDispatched(input) {
    this.dispatched.push(input);
  }

  async defer(input) {
    this.deferred.push(input);
  }

  async moveToDlq(input) {
    this.dlqMoves.push(input);
  }
}
