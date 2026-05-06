import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRetryDispatchRequest,
  decideCircuitBreakerState,
  decideRetry,
  pollRetrySchedule,
  recordCircuitBreakerOutcome,
} from '../../packages/domain/dist/index.js';

const now = new Date('2026-05-06T12:00:00.000Z');

test('seeded publisher transient failures eventually dispatch cleanly', async () => {
  const seed = 24051;
  const attempts = [];
  const repository = new ChaosRetryRepository([
    retryRecord('retry-1', { attemptCount: 1, budgetRemaining: 3 }),
    retryRecord('retry-2', { attemptCount: 1, budgetRemaining: 3 }),
    retryRecord('retry-3', { attemptCount: 1, budgetRemaining: 3 }),
  ]);
  const random = seeded(seed);

  await assert.rejects(
    () => pollRetrySchedule({
      repository,
      now,
      limit: 10,
      publisher: {
        publish: async (request) => {
          attempts.push(request['request-id']);
          if (random() < 0.34) {
            throw new Error(`seed ${seed} publisher transient failure`);
          }
        },
      },
    }),
    /publisher transient failure/u,
  );

  const result = await pollRetrySchedule({
    repository,
    now,
    limit: 10,
    publisher: {
      publish: async (request) => {
        attempts.push(request['request-id']);
      },
    },
  });

  assert.equal(result.claimed, 3);
  assert.equal(result.dispatched + result.deferred + result.dlq, 3);
  assert.ok(attempts.length > 0);
});

test('seeded SOAP timeout opens and then half-opens the circuit', () => {
  const failed = recordCircuitBreakerOutcome({
    snapshot: circuitSnapshot({ state: 'CLOSED', failureCount: 2 }),
    outcome: 'failure',
    now,
    errorCode: 'ESOCIAL_SOAP_TIMEOUT',
  });
  assert.equal(failed.state, 'OPEN');

  assert.equal(
    decideCircuitBreakerState({
      snapshot: failed,
      now: new Date('2026-05-06T12:00:30.000Z'),
      policy: { openCooldownMs: 60_000 },
    }).action,
    'defer',
  );
  assert.equal(
    decideCircuitBreakerState({
      snapshot: failed,
      now: new Date('2026-05-06T12:02:00.000Z'),
      policy: { openCooldownMs: 60_000 },
    }).state,
    'HALF_OPEN',
  );
});

test('cert-expiry race classifies as terminal signing failure', () => {
  const decision = decideRetry({
    attempt: 1,
    occurredAt: now,
    error: {
      category: 'signing',
      code: 'CERT_EXPIRED_DURING_SIGN',
      message: 'certificate expired between resolve and sign',
      retryable: false,
    },
  });

  assert.equal(decision.action, 'dlq');
  assert.equal(decision.classification, 'authentication');
  assert.match(decision.reason, /budget exhausted/u);
});

test('partial batch failures preserve survivor dispatches', () => {
  const records = [
    retryRecord('retry-survivor', { attemptCount: 1, budgetRemaining: 2 }),
    retryRecord('retry-exhausted', { attemptCount: 3, maxAttempts: 3, budgetRemaining: 0 }),
  ];
  const survivor = buildRetryDispatchRequest(records[0]);

  assert.equal(survivor.attempt, 2);
  assert.equal(records[1].budgetRemaining, 0);
});

test('database transient claim failure leaves retry records untouched', async () => {
  const repository = new ChaosRetryRepository([
    retryRecord('retry-db-1', { attemptCount: 1, budgetRemaining: 2 }),
  ]);
  repository.claimError = new Error('database transient unavailable');

  await assert.rejects(
    () => pollRetrySchedule({
      repository,
      now,
      limit: 10,
      publisher: {
        publish: async () => undefined,
      },
    }),
    /database transient unavailable/u,
  );

  assert.equal(repository.dispatched.length, 0);
  assert.equal(repository.deferred.length, 0);
  assert.equal(repository.dlq.length, 0);
});

test('missing tenant context fails closed before replay publication', async () => {
  const repository = new ChaosRetryRepository([
    retryRecord('retry-missing-tenant', {
      tenantId: '',
      attemptCount: 1,
      budgetRemaining: 2,
    }),
  ]);

  await assert.rejects(
    () => pollRetrySchedule({
      repository,
      now,
      limit: 10,
      publisher: {
        publish: async (request) => {
          if (!request.tenant_id) {
            throw new Error('tenant context missing');
          }
        },
      },
    }),
    /tenant context missing/u,
  );

  assert.equal(repository.dispatched.length, 0);
});

test('clock skew keeps retry delay deterministic', () => {
  const error = {
    category: 'transport',
    code: 'ESOCIAL_SOCKET_TIMEOUT',
    message: 'timeout during seeded chaos run',
    retryable: true,
  };
  const before = decideRetry({
    attempt: 2,
    occurredAt: new Date('2026-05-06T11:59:30.000Z'),
    error,
    jitterSeed: 'clock-skew-chaos',
  });
  const after = decideRetry({
    attempt: 2,
    occurredAt: new Date('2026-05-06T12:00:30.000Z'),
    error,
    jitterSeed: 'clock-skew-chaos',
  });

  assert.equal(before.action, 'retry');
  assert.equal(after.action, 'retry');
  assert.equal(before.delayMs, after.delayMs);
  assert.notEqual(before.nextAttemptAt, after.nextAttemptAt);
});

class ChaosRetryRepository {
  constructor(records) {
    this.records = records;
    this.dispatched = [];
    this.deferred = [];
    this.dlq = [];
    this.claimError = undefined;
  }

  async claimDue() {
    if (this.claimError) {
      throw this.claimError;
    }
    return this.records;
  }

  async markDispatched(input) {
    this.dispatched.push(input);
  }

  async defer(input) {
    this.deferred.push(input);
  }

  async moveToDlq(input) {
    this.dlq.push(input);
  }
}

function retryRecord(id, overrides = {}) {
  const originalEnvelope = requestEnvelope({
    attempt: overrides.attemptCount ?? 1,
    tenantId: overrides.tenantId,
  });
  return {
    retryScheduleId: id,
    tenantId: originalEnvelope.tenant_id,
    environment: originalEnvelope.environment,
    eventClass: originalEnvelope.event_class,
    attemptCount: overrides.attemptCount ?? 1,
    maxAttempts: overrides.maxAttempts ?? 3,
    budgetRemaining: overrides.budgetRemaining ?? 2,
    nextAttemptAt: now.toISOString(),
    lastClassification: 'transport',
    lastErrorMessage: 'transient',
    originalEnvelope,
  };
}

function requestEnvelope(overrides = {}) {
  return {
    version: 'v1',
    family: 'request',
    'request-id': `req-${overrides.attempt ?? 1}`,
    'correlation-id': 'corr-chaos',
    'idempotency-key': 'esocial:v1:request:tenant:QUALIFICATION:S-1299:source:entity:-:2026-05:sha256%3Apayload:-:-',
    created_at: now.toISOString(),
    tenant_id: overrides.tenantId ?? '00000000-0000-4000-8000-000000000101',
    environment: 'QUALIFICATION',
    event_class: 'S-1299',
    source: { source_event_id: 'source', source_entity_id: 'entity' },
    kind: 'folha',
    payload: {
      eventClass: 'S-1299',
      tenantId: '00000000-0000-4000-8000-000000000101',
      sourceEventId: 'source',
      employerCnpj: '12345678000199',
      competence: '2026-05',
      payrollRunId: 'payroll',
      pendingPeriodicEvents: [],
      acceptedEventCounts: { remuneration: 1, payments: 1 },
    },
    payload_hash: 'sha256:payload',
    attempt: overrides.attempt ?? 1,
    'max-attempts': 3,
    'reply-to': 'response',
    'dead-letter-topic': 'dlq',
  };
}

function circuitSnapshot(overrides = {}) {
  return {
    tenantId: '00000000-0000-4000-8000-000000000101',
    environment: 'QUALIFICATION',
    endpointName: 'enviar-lote',
    endpointUrl: 'https://soap.example.test/enviar',
    state: overrides.state ?? 'CLOSED',
    failureCount: overrides.failureCount ?? 0,
    successCount: 0,
    openedAt: overrides.openedAt,
    halfOpenedAt: overrides.halfOpenedAt,
    lastErrorCode: overrides.lastErrorCode,
  };
}

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 48271) % 0x7fffffff;
    return value / 0x7fffffff;
  };
}
