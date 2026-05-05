import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ESOCIAL_LOG_FIELD_NAMES,
  ESOCIAL_METRIC_NAMES,
  buildMetricPayload,
  buildReplayRequestFromDlq,
  buildRetryAttemptEvidence,
  buildRetryScheduleCommand,
  buildStructuredLogEntry,
  buildTerminalDlqPayload,
  classifyRetryFailureDetail,
  contextFromEnvelope,
  decideCircuitBreakerState,
  decideRetry,
  deriveReplayIdempotencyKey,
  listDlqMessages,
  pollRetrySchedule,
  recordCircuitBreakerOutcome,
  recordCircuitBreakerOutcomeWithAudit,
  withTraceSpan,
} from '../../../packages/domain/dist/index.js';
import { createDlqReplayHandler } from '../../../services/http-gateway/dist/dlq/replay.js';

const now = new Date('2026-05-05T12:00:00.000Z');

test('retry classifier assigns C1 categories, retryability, and budgets', () => {
  const cases = [
    [
      transportError('ESOCIAL_SOAP_503', 'HTTP 503'),
      { category: 'transport', retryable: true, budget: 5 },
    ],
    [
      transportError('ESOCIAL_TIMEOUT', 'timeout'),
      { category: 'timeout', retryable: true, budget: 5 },
    ],
    [
      { category: 'schema', code: 'ESOCIAL_SCHEMA_INVALID', message: 'schema', retryable: false },
      { category: 'schema', retryable: false, budget: 0 },
    ],
    [
      { category: 'regulatory', code: 'ESOCIAL_REG_301', message: 'rejected', retryable: false },
      { category: 'regulatory', retryable: false, budget: 0 },
    ],
    [
      { category: 'authentication', code: 'ESOCIAL_CERTIFICATE_EXPIRED', message: 'expired' },
      { category: 'authentication', retryable: true, budget: 1 },
    ],
    [
      { category: 'internal', code: 'ESOCIAL_INTERNAL', message: 'bug', retryable: true },
      { category: 'internal', retryable: false, budget: 0 },
    ],
  ];

  for (const [error, expected] of cases) {
    assert.deepEqual(classifyRetryFailureDetail(error), expected);
  }
});

test('transient transport failure schedules retry and the replayed attempt produces exactly one accepted submission', () => {
  const request = requestEnvelope();
  const error = {
    category: 'transport',
    code: 'ESOCIAL_SOAP_503',
    message: 'Sandbox SOAP transport unavailable.',
    retryable: true,
    occurred_at: now.toISOString(),
  };
  const accepted = [];

  const decision = decideRetry({
    attempt: request.attempt,
    maxAttempts: request['max-attempts'],
    occurredAt: now,
    error,
    jitterSeed: 'phase8-transient',
  });
  assert.equal(decision.action, 'retry');
  assert.equal(decision.classification, 'transport');
  assert.equal(decision.nextAttempt, 2);
  assert.equal(decision.maxAttempts, 3);
  assert.match(decision.nextAttemptAt, /^2026-05-05T12:/u);

  const schedule = buildRetryScheduleCommand({
    request,
    eventRecordId: '00000000-0000-4000-8000-000000000821',
    batchId: '00000000-0000-4000-8000-000000000822',
    decision,
    error,
  });
  assert.equal(schedule.status, 'SCHEDULED');
  assert.equal(schedule.attemptCount, 1);
  assert.equal(schedule.budgetRemaining, 2);
  assert.equal(schedule.lastClassification, 'transport');

  const retryAttempt = {
    ...request,
    attempt: decision.nextAttempt,
  };
  accepted.push({
    status: 'accepted',
    requestId: retryAttempt['request-id'],
    attempt: retryAttempt.attempt,
  });

  assert.equal(accepted.length, 1);
  assert.deepEqual(accepted[0], {
    status: 'accepted',
    requestId: request['request-id'],
    attempt: 2,
  });
});

test('retry poller republishes due schedules and persistent transport failures move to DLQ after budget', async () => {
  const transient = retryRecord({
    suffix: 'poll-transient',
    retryScheduleId: 'retry-transient',
    attemptCount: 1,
    budgetRemaining: 2,
  });
  const exhausted = retryRecord({
    suffix: 'poll-exhausted',
    retryScheduleId: 'retry-exhausted',
    attemptCount: 5,
    maxAttempts: 5,
    budgetRemaining: 0,
  });
  const repository = recordingRetryRepository([transient, exhausted]);
  const published = [];

  const result = await pollRetrySchedule({
    repository,
    now,
    publisher: {
      async publish(request) {
        published.push(request);
      },
    },
  });

  assert.deepEqual(result, {
    claimed: 2,
    dispatched: 1,
    deferred: 0,
    dlq: 1,
  });
  assert.equal(published.length, 1);
  assert.equal(published[0].attempt, 2);
  assert.equal(repository.dispatched[0].retryScheduleId, 'retry-transient');
  assert.equal(repository.dlq[0].retryScheduleId, 'retry-exhausted');
  assert.equal(repository.dlq[0].dlq.final_attempt, 5);
  assert.equal(repository.dlq[0].dlqItem.status, 'OPEN');
  assert.equal(repository.dlq[0].dlqItem.replayHint.eligible, true);
});

test('circuit breaker opens, half-open probes close, and open circuits defer without consuming attempts', async () => {
  const request = requestEnvelope('circuit');
  const firstFailure = recordCircuitBreakerOutcomeWithAudit({
    now,
    outcome: 'failure',
    errorCode: 'ESOCIAL_SOAP_503',
    snapshot: circuitSnapshot(request, {
      state: 'CLOSED',
      failureCount: 2,
    }),
  });
  assert.equal(firstFailure.snapshot.state, 'OPEN');
  assert.equal(firstFailure.audit.toState, 'OPEN');

  const closed = recordCircuitBreakerOutcomeWithAudit({
    now,
    outcome: 'success',
    snapshot: {
      ...firstFailure.snapshot,
      state: 'HALF_OPEN',
      halfOpenedAt: now.toISOString(),
    },
  });
  assert.equal(closed.snapshot.state, 'CLOSED');
  assert.equal(closed.audit.toState, 'CLOSED');

  const due = retryRecord({
    suffix: 'circuit-deferred',
    retryScheduleId: 'retry-circuit',
    attemptCount: 2,
    budgetRemaining: 3,
  });
  const repository = recordingRetryRepository([due]);
  const result = await pollRetrySchedule({
    repository,
    now,
    publisher: {
      async publish() {
        throw new Error('open circuit must not publish');
      },
    },
    circuitGate: {
      async shouldDefer() {
        return {
          defer: true,
          nextAttemptAt: '2026-05-05T12:15:00.000Z',
          reason: 'Circuit is open; deferred with elongated backoff.',
        };
      },
    },
  });

  assert.deepEqual(result, {
    claimed: 1,
    dispatched: 0,
    deferred: 1,
    dlq: 0,
  });
  assert.equal(repository.deferred[0].retryScheduleId, 'retry-circuit');
  assert.equal(repository.deferred[0].reason, 'Circuit is open; deferred with elongated backoff.');
  assert.equal(repository.dispatched.length, 0);
});

test('terminal failure produces DLQ payload and no accepted regulatory submission', () => {
  const request = requestEnvelope('terminal');
  const error = {
    category: 'validation',
    code: 'ESOCIAL_MALFORMED_JSON',
    message: 'Message body is not a valid eSocial envelope.',
    retryable: false,
    occurred_at: now.toISOString(),
  };
  const decision = decideRetry({
    attempt: request.attempt,
    occurredAt: now,
    error,
    jitterSeed: 'phase8-terminal',
  });
  const accepted = [];

  assert.equal(decision.action, 'dlq');
  assert.equal(decision.classification, 'malformed');
  assert.equal(decision.retryable, false);

  const evidence = buildRetryAttemptEvidence({
    decision,
    error,
    attemptedAt: now.toISOString(),
  });
  const dlq = buildTerminalDlqPayload({
    request,
    errors: [error],
    occurredAt: now.toISOString(),
    finalAttempt: request.attempt,
    lastClassification: decision.classification,
    attemptHistory: [evidence],
  });

  assert.equal(accepted.length, 0);
  assert.equal(dlq.family, 'dlq');
  assert.equal(dlq.status, 'dlq');
  assert.equal(dlq.last_classification, 'malformed');
  assert.equal(dlq.original_envelope, request);
  assert.match(dlq.hashes.original_envelope_sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(dlq.replay_hint.eligible, true);
  assert.equal(listDlqMessages([dlq], {
    tenantId: request.tenant_id,
    eventClass: request.event_class,
    classification: 'malformed',
  }).length, 1);
});

test('operator replay derives a fresh request and audit evidence from DLQ payload', () => {
  const request = requestEnvelope('replay');
  const error = {
    category: 'transport',
    code: 'ESOCIAL_TIMEOUT',
    message: 'Timed out before definitive return.',
    retryable: true,
    occurred_at: now.toISOString(),
  };
  const dlq = buildTerminalDlqPayload({
    request,
    errors: [error],
    occurredAt: now.toISOString(),
    lastClassification: 'timeout',
  });
  const replayRequestId = '00000000-0000-4000-8000-000000000831';
  const replayCorrelationId = '00000000-0000-4000-8000-000000000832';

  const replay = buildReplayRequestFromDlq({
    dlq,
    replayedBy: 'operator:phase8',
    replayReason: 'official endpoint recovered',
    now,
    uuid: fixedUuid([replayRequestId, replayCorrelationId]),
  });

  assert.equal(replay.originalRequest, request);
  assert.equal(replay.request['request-id'], replayRequestId);
  assert.equal(replay.request['correlation-id'], replayCorrelationId);
  assert.equal(replay.request.attempt, 1);
  assert.equal(
    replay.request['idempotency-key'],
    deriveReplayIdempotencyKey(request['idempotency-key'], replayRequestId),
  );
  assert.equal(replay.auditEvent.action, 'dlq.replay.requested');
  assert.equal(replay.auditEvent.status, 'pending');
  assert.equal(replay.auditEvent.target.id, dlq['request-id']);
  assert.equal(replay.auditEvent.after.replay_reason, 'official endpoint recovered');
});

test('HTTP DLQ replay endpoint enforces IAM and idempotency clash rule before publishing replay', async () => {
  const request = requestEnvelope('http-replay');
  const dlq = buildTerminalDlqPayload({
    request,
    errors: [transportError('ESOCIAL_TIMEOUT', 'Timed out before definitive return.')],
    occurredAt: now.toISOString(),
    lastClassification: 'timeout',
  });
  const published = [];
  const audits = [];
  const marked = [];
  const handler = createDlqReplayHandler({
    now: () => now,
    uuid: fixedUuid([
      '00000000-0000-4000-8000-000000000851',
      '00000000-0000-4000-8000-000000000852',
    ]),
    requestPublisher: {
      async publish(command) {
        published.push(command);
      },
    },
    repository: {
      async load() {
        return dlq;
      },
      async completedIdempotencyKeys() {
        return [request['idempotency-key']];
      },
      async appendReplayAudit(input) {
        audits.push(input);
      },
      async markReplayRequested(input) {
        marked.push(input);
      },
    },
  });

  const forbidden = await handler({
    httpMethod: 'POST',
    path: '/dlq/dlq-http/replay',
  });
  assert.equal(forbidden.statusCode, 403);

  const clashing = await handler(replayEvent({
    force: false,
    reason: 'endpoint recovered',
  }));
  assert.equal(clashing.statusCode, 409);
  assert.equal(published.length, 0);

  const accepted = await handler(replayEvent({
    force: true,
    reason: 'endpoint recovered',
  }));
  assert.equal(accepted.statusCode, 202);
  const body = JSON.parse(accepted.body);
  assert.equal(body.status, 'replay_requested');
  assert.equal(body.requestId, '00000000-0000-4000-8000-000000000851');
  assert.equal(published[0].envelope.attempt, 1);
  assert.equal(published[0].envelope['idempotency-key'], body.idempotencyKey);
  assert.equal(audits[0].auditEvent.action, 'dlq.replay.requested');
  assert.equal(marked[0].replayRequestId, body.requestId);
});

test('observability helpers emit stable log fields, metrics, traces, and circuit decisions', async () => {
  const request = requestEnvelope('observability');
  const context = contextFromEnvelope(request, {
    batchId: '00000000-0000-4000-8000-000000000841',
    protocol: '1.2.202605.000000000000000001',
    receipt: '1.1.0000000000000000001',
  });
  const log = buildStructuredLogEntry({
    level: 'info',
    service: 'submission',
    stage: 'submit.accepted',
    message: 'Submission accepted by sandbox.',
    context,
    now,
  });
  for (const field of ESOCIAL_LOG_FIELD_NAMES) {
    assert.equal(Object.hasOwn(log, field), true, field);
  }

  const metric = buildMetricPayload({
    name: ESOCIAL_METRIC_NAMES.soapLatencyMs,
    value: 125,
    context: {
      ...context,
      classification: 'accepted',
      endpointName: 'qualification-submit',
    },
    now,
  });
  assert.equal(metric[ESOCIAL_METRIC_NAMES.soapLatencyMs], 125);
  assert.equal(metric._aws.CloudWatchMetrics[0].Metrics[0].Unit, 'Milliseconds');

  const spans = [];
  await withTraceSpan(
    {
      service: 'retorno',
      spanName: 'parse-return',
      context,
      sink: (span) => spans.push(span),
      now: fixedClock([
        new Date('2026-05-05T12:00:00.000Z'),
        new Date('2026-05-05T12:00:00.045Z'),
      ]),
    },
    async () => 'ok',
  );
  assert.equal(spans[0].durationMs, 45);
  assert.equal(spans[0].status, 'ok');

  const openDecision = decideCircuitBreakerState({
    now,
    snapshot: {
      tenantId: request.tenant_id,
      environment: request.environment,
      endpointName: 'qualification-submit',
      state: 'OPEN',
      failureCount: 3,
      successCount: 0,
      openedAt: '2026-05-05T11:59:00.000Z',
    },
    policy: {
      openCooldownMs: 300_000,
    },
  });
  assert.equal(openDecision.action, 'defer');

  const closed = recordCircuitBreakerOutcome({
    now,
    outcome: 'success',
    snapshot: {
      tenantId: request.tenant_id,
      environment: request.environment,
      endpointName: 'qualification-submit',
      state: 'HALF_OPEN',
      failureCount: 3,
      successCount: 0,
      openedAt: '2026-05-05T11:50:00.000Z',
    },
  });
  assert.equal(closed.state, 'CLOSED');
});

function requestEnvelope(suffix = 'transient') {
  return {
    version: 'v1',
    family: 'request',
    'request-id': `request-${suffix}`,
    'correlation-id': `correlation-${suffix}`,
    'idempotency-key': `idem-${suffix}`,
    created_at: now.toISOString(),
    tenant_id: '00000000-0000-4000-8000-000000000820',
    environment: 'QUALIFICATION',
    event_class: 'S-1299',
    source: {
      source_event_id: `source-${suffix}`,
      source_entity_id: 'closure-2026-01',
      payroll_run_id: 'payroll-2026-01',
    },
    kind: 'submit',
    payload_hash: `sha256:${suffix}`,
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.submit.response',
    'dead-letter-topic': 'sgp.esocial.dlq',
    payload: {
      batchId: '00000000-0000-4000-8000-000000000822',
      signedEnvelope: {
        pkcs7Sha256: `sha256:signed-${suffix}`,
      },
    },
  };
}

function transportError(code, message) {
  return {
    category: 'transport',
    code,
    message,
    retryable: true,
    occurred_at: now.toISOString(),
  };
}

function retryRecord(input) {
  const request = requestEnvelope(input.suffix);
  return {
    retryScheduleId: input.retryScheduleId,
    tenantId: request.tenant_id,
    eventRecordId: `00000000-0000-4000-8000-${input.suffix === 'poll-exhausted' ? '000000000862' : '000000000861'}`,
    batchId: request.payload.batchId,
    environment: request.environment,
    eventClass: request.event_class,
    attemptCount: input.attemptCount,
    maxAttempts: input.maxAttempts ?? 5,
    budgetRemaining: input.budgetRemaining,
    nextAttemptAt: now.toISOString(),
    lastClassification: 'transport',
    lastErrorCode: 'ESOCIAL_SOAP_503',
    lastErrorMessage: 'Sandbox SOAP transport unavailable.',
    originalEnvelope: request,
  };
}

function recordingRetryRepository(records) {
  return {
    dispatched: [],
    deferred: [],
    dlq: [],
    async claimDue() {
      return records;
    },
    async markDispatched(input) {
      this.dispatched.push(input);
    },
    async defer(input) {
      this.deferred.push(input);
    },
    async moveToDlq(input) {
      this.dlq.push(input);
    },
  };
}

function circuitSnapshot(request, overrides = {}) {
  return {
    tenantId: request.tenant_id,
    environment: request.environment,
    endpointName: 'qualification-submit',
    state: 'CLOSED',
    failureCount: 0,
    successCount: 0,
    ...overrides,
  };
}

function replayEvent(input) {
  return {
    httpMethod: 'POST',
    path: '/dlq/dlq-http/replay',
    pathParameters: {
      id: 'dlq-http',
    },
    queryStringParameters: input.force ? { force: 'true' } : {},
    requestContext: {
      identity: {
        userArn: 'arn:aws:iam::123456789012:role/esocial-operator',
      },
    },
    body: JSON.stringify({
      reason: input.reason,
    }),
  };
}

function fixedUuid(values) {
  let index = 0;
  return () => values[index++];
}

function fixedClock(values) {
  let index = 0;
  return () => values[index++] ?? values.at(-1);
}
