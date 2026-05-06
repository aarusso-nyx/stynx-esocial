import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildEsocialIdempotencyKey,
} from '../../packages/contracts/dist/index.js';
import {
  ESOCIAL_METRIC_NAMES,
  buildMetricPayload,
  createMetricEmitter,
  createStructuredLogger,
} from '../../packages/domain/dist/index.js';
import {
  createSubmissionHandler,
} from '../../services/submission/dist/handler.js';

const root = new URL('../..', import.meta.url).pathname;
const now = new Date('2026-05-05T12:00:00.000Z');
const tenantId = '00000000-0000-4000-8000-000000000807';

test('submission round-trip logs and metric labels do not leak CPF, CNPJ, salary, or XML', async () => {
  const lines = [];
  const metrics = [];
  const envelope = contractExample('S-1200');

  const handler = createSubmissionHandler({
    processor: fakeProcessor(),
    logger: createStructuredLogger({
      service: 'submission',
      sink: (line) => lines.push(line),
      now: () => now,
    }),
    metrics: createMetricEmitter({ sink: (line) => metrics.push(line) }),
    now: () => now,
  });

  const response = await handler({
    Records: [
      {
        messageId: 'pii-record',
        body: JSON.stringify(envelope),
      },
    ],
  });

  assert.deepEqual(response.batchItemFailures, []);
  const serialized = [...lines, ...metrics].join('\n');
  assert.doesNotMatch(serialized, /12345678901/u);
  assert.doesNotMatch(serialized, /987\.654\.321-00/u);
  assert.doesNotMatch(serialized, /12345678000195/u);
  assert.doesNotMatch(serialized, /98765\.43/u);
  assert.doesNotMatch(serialized, /<eSocial>/u);

  const metric = buildMetricPayload({
    name: ESOCIAL_METRIC_NAMES.accepted,
    value: 1,
    context: {
      tenantId: '00000000-0000-4000-8000-000000000807',
      environment: 'QUALIFICATION',
      eventClass: 'S-1200',
    },
    now,
  });
  const dimensions = metric._aws.CloudWatchMetrics[0].Dimensions[0];
  assert.deepEqual(dimensions, ['tenantId', 'environment', 'eventClass']);
  assert.doesNotMatch(JSON.stringify(dimensions), /cpf|cnpj|salary|remuner/u);
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
  envelope.payload_hash = `sha256:redaction-${eventClass}`;
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
          batchId: 'batch-pii',
          eventRecordId: 'event-pii',
          status: 'sent',
          route: { name: 'periodic', eventClasses: [request.event_class], stage: 'build' },
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
        response: { status: 'sent' },
        auditEvent: { status: 'sent' },
      };
    },
    async publishMalformedToDlq() {
      throw new Error('redaction fixture should validate');
    },
    async publishIngressValidationFailure() {
      throw new Error('redaction fixture should pass idempotency validation');
    },
  };
}
