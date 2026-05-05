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
  contextFromEnvelope,
  decideCircuitBreakerState,
  decideRetry,
  deriveReplayIdempotencyKey,
  listDlqMessages,
  recordCircuitBreakerOutcome,
  withTraceSpan,
} from '../../../packages/domain/dist/index.js';

const now = new Date('2026-05-05T12:00:00.000Z');

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
    assert.equal(typeof log[field], 'string', field);
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

function fixedUuid(values) {
  let index = 0;
  return () => values[index++];
}

function fixedClock(values) {
  let index = 0;
  return () => values[index++] ?? values.at(-1);
}
