import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDlqReplayHandler } from '../dist/dlq/replay.js';

const tenantId = '00000000-0000-4000-8000-000000000701';
const otherTenantId = '00000000-0000-4000-8000-000000000702';
const now = new Date('2026-05-06T12:00:00.000Z');

test('DLQ replay rejects malformed, expired, and wrong-issuer OIDC authorizers', async () => {
  const { handler } = fixture();

  for (const [authorizer, error] of [
    [{}, 'invalid_authorizer_token'],
    [{ iss: 'wrong', sub: 'operator-1', roles: 'replay', exp: 1_999_999_999 }, 'wrong_token_issuer'],
    [{ iss: 'esocial-operator', sub: 'operator-1', roles: 'replay', exp: 1 }, 'token_expired'],
  ]) {
    const response = await handler(event({ authorizer }));
    assert.equal(response.statusCode, 401);
    assert.equal(JSON.parse(response.body).error, error);
  }
});

test('DLQ replay rejects wrong tenant and missing replay permission with auth.denied audit', async () => {
  const { handler, audits, published } = fixture();

  const wrongTenant = await handler(event({
    authorizer: oidc({
      tenantId: otherTenantId,
      roles: ['replay'],
    }),
  }));
  assert.equal(wrongTenant.statusCode, 403);
  assert.equal(JSON.parse(wrongTenant.body).error, 'tenant_forbidden');

  const readOnly = await handler(event({
    authorizer: oidc({
      tenantId,
      roles: ['read'],
    }),
  }));
  assert.equal(readOnly.statusCode, 403);
  assert.equal(JSON.parse(readOnly.body).error, 'replay_permission_required');
  assert.equal(published.length, 0);
  assert.deepEqual(
    audits.map((audit) => audit.auditEvent.action),
    ['auth.denied', 'auth.denied'],
  );
});

test('DLQ replay clash force is admin-only and admin force publishes replay', async () => {
  const { handler, audits, published } = fixture({
    completedIdempotencyKeys: ['idem-original'],
  });

  const clashing = await handler(event({
    authorizer: oidc({
      tenantId,
      roles: ['replay'],
    }),
  }));
  assert.equal(clashing.statusCode, 409);
  assert.equal(JSON.parse(clashing.body).error, 'idempotency_key_completed');

  const forceDenied = await handler(event({
    force: true,
    authorizer: oidc({
      tenantId,
      roles: ['replay'],
    }),
  }));
  assert.equal(forceDenied.statusCode, 409);
  assert.equal(JSON.parse(forceDenied.body).error, 'force_replay_requires_admin');

  const accepted = await handler(event({
    force: true,
    authorizer: oidc({
      tenantId,
      roles: ['admin'],
    }),
  }));
  assert.equal(accepted.statusCode, 202);
  assert.equal(JSON.parse(accepted.body).status, 'replay_requested');
  assert.equal(published.length, 1);
  assert.equal(audits.at(-1).auditEvent.action, 'dlq.replay.requested');
});

function fixture(options = {}) {
  const published = [];
  const audits = [];
  const marked = [];
  const dlq = {
    version: 'v1',
    family: 'dlq',
    'request-id': 'dlq-1',
    'correlation-id': 'corr-1',
    'idempotency-key': 'idem-dlq',
    created_at: now.toISOString(),
    tenant_id: tenantId,
    environment: 'QUALIFICATION',
    event_class: 'S-1299',
    source: {
      system: 'SGP',
      source_event_id: 'source-1',
    },
    status: 'dlq',
    final_attempt: 3,
    dlq_reason: 'timeout',
    errors: [
      {
        code: 'ESOCIAL_TIMEOUT',
        message: 'Timed out before definitive return.',
      },
    ],
    original_envelope: {
      version: 'v1',
      family: 'request',
      'request-id': 'request-original',
      'correlation-id': 'corr-original',
      'idempotency-key': 'idem-original',
      created_at: now.toISOString(),
      tenant_id: tenantId,
      environment: 'QUALIFICATION',
      event_class: 'S-1299',
      source: {
        system: 'SGP',
        source_event_id: 'source-1',
      },
      attempt: 3,
      payload: {
        eventClass: 'S-1299',
        tenantId,
        sourceEventId: 'source-1',
        employerCnpj: '12345678000199',
        competence: '2026-05',
        payrollRunId: 'payroll-1',
        acceptedEventCounts: {
          remuneration: 1,
          payments: 1,
        },
        pendingPeriodicEvents: [],
      },
    },
    replay_hint: {
      eligible: true,
      schema_version: 'v1',
    },
  };

  return {
    published,
    audits,
    marked,
    handler: createDlqReplayHandler({
      now: () => now,
      uuid: fixedUuid([
        '00000000-0000-4000-8000-000000000751',
        '00000000-0000-4000-8000-000000000752',
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
          return options.completedIdempotencyKeys ?? [];
        },
        async appendReplayAudit(input) {
          audits.push(input);
        },
        async markReplayRequested(input) {
          marked.push(input);
        },
      },
    }),
  };
}

function event(input = {}) {
  return {
    httpMethod: 'POST',
    path: '/dlq/dlq-1/replay',
    pathParameters: {
      id: 'dlq-1',
    },
    queryStringParameters: input.force ? { force: 'true' } : {},
    body: JSON.stringify({ reason: 'operator requested replay' }),
    requestContext: {
      authorizer: input.authorizer,
    },
  };
}

function oidc(input) {
  return {
    iss: 'esocial-operator',
    sub: 'operator-1',
    tenant_id: input.tenantId,
    roles: input.roles,
    exp: 1_999_999_999,
  };
}

function fixedUuid(values) {
  let index = 0;
  return () => values[index++] ?? values.at(-1);
}
