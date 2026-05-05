import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ESOCIAL_ERROR_CATEGORIES,
  ESOCIAL_RELAY_EVENT_CLASSES,
  ESOCIAL_STATUSES,
  ESOCIAL_TRANSPORT_FAMILIES,
} from '../../packages/contracts/src/kinds.ts';
import { buildEsocialIdempotencyKey } from '../../packages/contracts/src/idempotency.ts';

const root = new URL('../..', import.meta.url).pathname;
const now = '2026-05-04T12:00:00.000Z';

const expectedEventClasses = [
  'S-1000',
  'S-1005',
  'S-1010',
  'S-1020',
  'S-1030',
  'S-1040',
  'S-1050',
  'S-1060',
  'S-1070',
  'S-1200',
  'S-1202',
  'S-1207',
  'S-1210',
  'S-1298',
  'S-1299',
  'S-2200',
  'S-2205',
  'S-2206',
  'S-2210',
  'S-2220',
  'S-2230',
  'S-2240',
  'S-2298',
  'S-2299',
  'S-2300',
  'S-2306',
  'S-2399',
  'S-2400',
  'S-2405',
  'S-2410',
  'S-2416',
  'S-2418',
  'S-2420',
  'S-2501',
  'S-3000',
  'S-5001',
  'S-5002',
  'S-5011',
  'S-5012',
  'S-5013',
];

const expectedStatuses = [
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

const expectedErrorCategories = [
  'validation',
  'schema',
  'xml_build',
  'signing',
  'transport',
  'regulatory',
  'configuration',
  'authentication',
  'idempotency',
  'totalizer_parse',
  'internal',
];

test('contract taxonomy exports the full event, status, and error surface', () => {
  const index = readFileSync(join(root, 'packages/contracts/src/index.ts'), 'utf8');

  assert.deepEqual([...ESOCIAL_RELAY_EVENT_CLASSES], expectedEventClasses);
  assert.equal(ESOCIAL_RELAY_EVENT_CLASSES.length, 40);
  assert.deepEqual([...ESOCIAL_STATUSES], expectedStatuses);
  assert.equal(ESOCIAL_STATUSES.length, 12);
  assert.deepEqual([...ESOCIAL_ERROR_CATEGORIES], expectedErrorCategories);
  assert.match(index, /idempotency\.js/);
});

test('consumer documentation matches exported statuses and error categories', () => {
  const consumers = readFileSync(join(root, 'docs/consumers.md'), 'utf8');

  for (const status of ESOCIAL_STATUSES) {
    assert.match(consumers, new RegExp(`\\\`${status}\\\``));
  }

  for (const category of ESOCIAL_ERROR_CATEGORIES) {
    assert.match(consumers, new RegExp(`\\\`${category}\\\``));
  }

  for (const family of ESOCIAL_TRANSPORT_FAMILIES) {
    assert.match(consumers, new RegExp(`\\\`${family}\\\``));
  }
});

test('versioned envelope fixtures cover every event class and family', () => {
  const fixtures = ESOCIAL_RELAY_EVENT_CLASSES.flatMap((eventClass) =>
    ESOCIAL_TRANSPORT_FAMILIES.map((family) =>
      fixtureForFamily(family, eventClass),
    ),
  );

  assert.equal(fixtures.length, 280);

  for (const fixture of fixtures) {
    assertBaseEnvelope(fixture);
    assert.equal(fixture.version, 'v1');
    assert.equal(fixture.event_class.startsWith('S-'), true);
    assert.ok(ESOCIAL_RELAY_EVENT_CLASSES.includes(fixture.event_class));
    assert.ok(ESOCIAL_TRANSPORT_FAMILIES.includes(fixture.family));
    assert.equal(typeof fixture['idempotency-key'], 'string');
    assert.notEqual(fixture['idempotency-key'].length, 0);

    switch (fixture.family) {
      case 'request':
        assert.equal(typeof fixture.payload_hash, 'string');
        assert.equal(fixture.kind, 'submit');
        assert.equal(fixture.payload.eventClass, fixture.event_class);
        break;
      case 'response':
        assert.ok(ESOCIAL_STATUSES.includes(fixture.status));
        assert.equal(fixture.processed_at, now);
        break;
      case 'spool':
        assert.ok(ESOCIAL_STATUSES.includes(fixture.status_transition.to));
        assert.equal(fixture.kind, 'submit');
        break;
      case 'audit':
        assert.equal(fixture.action, 'submit.status.changed');
        assert.ok(ESOCIAL_STATUSES.includes(fixture.status));
        break;
      case 'retry':
        assert.equal(fixture.status, 'retry');
        assert.equal(typeof fixture.next_attempt_at, 'string');
        break;
      case 'dlq':
        assert.equal(fixture.status, 'dlq');
        assert.equal(fixture.errors[0].category, 'transport');
        break;
      case 'replay':
        assert.equal(fixture.status, 'pending');
        assert.equal(typeof fixture.original_request_id, 'string');
        break;
      default:
        assert.fail(`unexpected family ${fixture.family}`);
    }
  }
});

test('idempotency builder is deterministic and collision-resistant for contract inputs', () => {
  const baseInput = {
    family: 'request',
    tenant_id: 'tenant-a',
    environment: 'QUALIFICATION',
    event_class: 'S-1200',
    source_event_id: 'event-1',
    source_entity_ids: ['employee-2', 'employee-1'],
    competence: '2026-04',
    payload_hash: 'sha256:payload-a',
  };

  const first = buildEsocialIdempotencyKey(baseInput);
  const same = buildEsocialIdempotencyKey({
    ...baseInput,
    source_entity_ids: ['employee-1', 'employee-2'],
  });
  const differentPayload = buildEsocialIdempotencyKey({
    ...baseInput,
    payload_hash: 'sha256:payload-b',
  });
  const differentFamily = buildEsocialIdempotencyKey({
    ...baseInput,
    family: 'replay',
  });
  const rectification = buildEsocialIdempotencyKey({
    ...baseInput,
    rectification: {
      marker: 'receipt',
      reference: '1.2.202604.0000001',
    },
  });

  assert.equal(first.value, same.value);
  assert.notEqual(first.value, differentPayload.value);
  assert.notEqual(first.value, differentFamily.value);
  assert.notEqual(first.value, rectification.value);
  assert.equal(first.version, 'v1');
});

function fixtureForFamily(family, eventClass) {
  const base = baseEnvelope(family, eventClass);

  if (family === 'request') {
    return {
      ...base,
      kind: 'submit',
      attempt: 1,
      'max-attempts': 3,
      'reply-to': 'sgp.esocial.submit.response',
      'dead-letter-topic': 'sgp.esocial.dlq',
      payload_hash: payloadHashFor(eventClass),
      payload: {
        eventClass,
        exampleXmlPath: goldenExamplePath(eventClass),
      },
    };
  }

  if (family === 'response') {
    return {
      ...base,
      kind: 'submit',
      status: 'accepted',
      attempt: 1,
      processed_at: now,
      protocol_number: `PROTO-${eventClass}`,
      receipt_number: `REC-${eventClass}`,
      response_code: '201',
      response_description: 'Accepted in qualification fixture.',
      hashes: {
        request_sha256: payloadHashFor(eventClass),
        payload_sha256: payloadHashFor(eventClass),
        signed_payload_sha256: `sha256:signed-${eventClass}`,
      },
      payload: {
        eventClass,
      },
    };
  }

  if (family === 'spool') {
    return {
      ...base,
      message_id: `msg-${eventClass}`,
      kind: 'submit',
      status_transition: {
        from: 'sent',
        to: 'accepted',
      },
      response_hash: `sha256:response-${eventClass}`,
      occurred_at: now,
    };
  }

  if (family === 'audit') {
    return {
      ...base,
      actor_id: 'system:esocial-submission',
      action: 'submit.status.changed',
      status: 'sent',
      target: {
        type: 'esocial_event',
        id: `target-${eventClass}`,
      },
      occurred_at: now,
    };
  }

  if (family === 'retry') {
    return {
      ...base,
      kind: 'submit',
      status: 'retry',
      attempt: 2,
      'max-attempts': 3,
      next_attempt_at: '2026-05-04T12:05:00.000Z',
      retry_reason: 'sandbox transport timeout',
      errors: [contractError('transport')],
    };
  }

  if (family === 'dlq') {
    return {
      ...base,
      kind: 'submit',
      status: 'dlq',
      final_attempt: 3,
      dlq_reason: 'retry budget exhausted',
      failed_at: now,
      errors: [contractError('transport')],
      replay_topic: 'sgp.esocial.replay',
    };
  }

  return {
    ...base,
    kind: 'submit',
    status: 'pending',
    original_request_id: `req-${eventClass}`,
    replay_request_id: `replay-${eventClass}`,
    replayed_by: 'operator:test',
    replay_reason: 'contract fixture replay',
    payload: {
      eventClass,
    },
  };
}

function baseEnvelope(family, eventClass) {
  const key = buildEsocialIdempotencyKey({
    family,
    tenant_id: 'tenant-a',
    environment: 'QUALIFICATION',
    event_class: eventClass,
    source_event_id: `source-event-${eventClass}`,
    source_entity_id: `source-entity-${eventClass}`,
    competence: competenceFor(eventClass),
    payload_hash: payloadHashFor(eventClass),
  });

  return {
    version: 'v1',
    family,
    'request-id': `req-${family}-${eventClass}`,
    'correlation-id': `corr-${eventClass}`,
    'idempotency-key': key.value,
    created_at: now,
    tenant_id: 'tenant-a',
    environment: 'QUALIFICATION',
    event_class: eventClass,
    source: {
      source_event_id: `source-event-${eventClass}`,
      source_entity_id: `source-entity-${eventClass}`,
      payroll_run_id: competenceFor(eventClass) ? 'payroll-2026-04' : undefined,
      employee_id: eventClass.startsWith('S-2') ? 'employee-1' : undefined,
    },
  };
}

function assertBaseEnvelope(fixture) {
  assert.equal(typeof fixture['request-id'], 'string');
  assert.equal(typeof fixture['correlation-id'], 'string');
  assert.equal(typeof fixture.created_at, 'string');
  assert.equal(fixture.tenant_id, 'tenant-a');
  assert.equal(fixture.environment, 'QUALIFICATION');
  assert.equal(typeof fixture.source, 'object');
}

function contractError(category) {
  return {
    category,
    code: `ESOCIAL_${category.toUpperCase()}`,
    message: `${category} fixture error`,
    retryable: category === 'transport',
    occurred_at: now,
  };
}

function payloadHashFor(eventClass) {
  const examplePath = goldenExamplePath(eventClass);
  const content = examplePath
    ? readFileSync(join(root, examplePath), 'utf8')
    : `no-standalone-golden:${eventClass}`;

  if (examplePath) assert.equal(content.trimStart().startsWith('<'), true);

  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function goldenExamplePath(eventClass) {
  const eventsDoc = readFileSync(join(root, 'docs/events.md'), 'utf8');
  const line = eventsDoc
    .split('\n')
    .find((candidate) => candidate.startsWith(`| ${eventClass} |`));
  const match = line?.match(/`(templates\/golden\/[^`]+)`/);
  return match ? `docs/${match[1]}` : null;
}

function competenceFor(eventClass) {
  return eventClass.startsWith('S-12') ||
    eventClass.startsWith('S-50') ||
    eventClass === 'S-1298' ||
    eventClass === 'S-1299'
    ? '2026-04'
    : undefined;
}
