import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ESOCIAL_RELAY_EVENT_CLASSES,
  buildEsocialIdempotencyKey,
} from '../../packages/contracts/dist/index.js';
import {
  assertRequiredLogFields,
  createMetricEmitter,
  createStructuredLogger,
} from '../../packages/domain/dist/index.js';
import {
  createSubmissionHandler,
} from '../../services/submission/dist/handler.js';

const root = new URL('../..', import.meta.url).pathname;
const now = new Date('2026-05-05T12:00:00.000Z');
const tenantId = '00000000-0000-4000-8000-000000000807';
const ESOCIAL_HANDLER_STAGE_SEQUENCE = [
  'ingress',
  'idempotency-lookup',
  'build',
  'xsd',
  'sign',
  'submit',
  'parse-return',
  'publish',
];

test('every active event family emits required log fields across submission stages', async () => {
  for (const eventClass of ESOCIAL_RELAY_EVENT_CLASSES) {
    const logs = [];
    const handler = createSubmissionHandler({
      processor: fakeProcessor(),
      logger: createStructuredLogger({
        service: 'submission',
        sink: (line) => logs.push(JSON.parse(line)),
        now: () => now,
      }),
      metrics: createMetricEmitter({ sink: () => undefined }),
      now: () => now,
    });

    const response = await handler({
      Records: [
        {
          messageId: `record-${eventClass}`,
          body: JSON.stringify(contractExample(eventClass)),
        },
      ],
    });

    assert.deepEqual(response.batchItemFailures, [], eventClass);
    const stages = new Set(logs.map((entry) => entry.stage));
    for (const stage of ESOCIAL_HANDLER_STAGE_SEQUENCE) {
      if (stage === 'parse-return') continue;
      assert.ok(stages.has(stage), `${eventClass} missing ${stage}`);
    }
    for (const entry of logs) {
      assertRequiredLogFields(entry);
      if (entry.stage !== 'ingress') {
        assert.equal(entry.eventClass, eventClass);
        assert.equal(entry.tenantId, tenantId);
      }
    }
  }
});

function contractExample(eventClass) {
  const envelope = JSON.parse(
    readFileSync(
      join(root, 'packages/contracts/examples/v1/requests', `${eventClass}.request.json`),
      'utf8',
    ),
  );
  envelope.tenant_id = tenantId;
  envelope.payload.tenantId = tenantId;
  envelope.source.source_event_id = `source-event-${eventClass}`;
  envelope.source.source_entity_id = `source-entity-${eventClass}`;
  envelope.payload_hash = `sha256:observability-${eventClass}`;
  envelope['idempotency-key'] = buildEsocialIdempotencyKey({
    family: 'request',
    tenant_id: envelope.tenant_id,
    environment: envelope.environment,
    event_class: envelope.event_class,
    source_event_id: envelope.source.source_event_id,
    source_entity_id: envelope.source.source_entity_id,
    competence: envelope.payload.competence ?? envelope.payload.validityStart,
    payload_hash: envelope.payload_hash,
  }).value;
  return envelope;
}

function fakeProcessor() {
  return {
    async process(request) {
      const occurredAt = now.toISOString();
      return {
        record: {
          inserted: true,
          messageId: request['request-id'],
          batchId: `batch-${request.event_class}`,
          eventRecordId: `event-${request.event_class}`,
          status: 'building',
          route: { name: 'tables', eventClasses: [request.event_class], stage: 'build' },
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
        response: { status: 'building' },
        auditEvent: { status: 'building' },
      };
    },
    async publishMalformedToDlq() {
      throw new Error('observability fixture should validate');
    },
    async publishIngressValidationFailure() {
      throw new Error('observability fixture should pass idempotency validation');
    },
  };
}
