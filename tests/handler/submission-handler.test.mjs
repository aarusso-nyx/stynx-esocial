import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { buildEsocialIdempotencyKey } from '../../packages/contracts/src/idempotency.ts';
import {
  dispatchByEventClass,
  SubmissionProcessor,
  TerminalSubmissionError,
} from '../../packages/domain/dist/index.js';
import { createSubmissionHandler } from '../../services/submission/dist/handler.js';

const fixedNow = new Date('2026-05-04T12:00:00.000Z');

test('accepted-shape request persists as building and emits no synthetic receipt', async () => {
  const repository = new InMemorySubmissionRepository();
  const published = createRecordingPublishers();
  const handler = createSubmissionHandler({
    repository,
    publishers: published.publishers,
    now: () => fixedNow,
  });
  const envelope = submissionEnvelope();

  const result = await handler(sqsEvent(envelope, 'msg-accepted'));

  assert.deepEqual(result, { batchItemFailures: [] });
  assert.equal(repository.insertCount, 1);
  assert.equal(repository.records[0]?.status, 'building');
  assert.equal(published.response.length, 1);
  assert.equal(published.response[0].envelope.status, 'building');
  assert.equal(published.response[0].envelope.protocol_number, undefined);
  assert.equal(published.response[0].envelope.receipt_number, undefined);
  assert.equal(published.spool.length, 1);
  assert.equal(published.spool[0].envelope.status_transition.to, 'building');
  assert.equal(published.spool[0].fifo.messageGroupId, `${envelope.tenant_id}:${envelope.event_class}`);
  assert.match(published.spool[0].fifo.messageDeduplicationId, /^[0-9a-f]{64}$/u);
});

test('submission dispatcher is invoked once for valid DTO ingress', async () => {
  const repository = new InMemorySubmissionRepository();
  const published = createRecordingPublishers();
  const calls = [];
  const handler = createSubmissionHandler({
    processor: new SubmissionProcessor({
      repository,
      publishers: published.publishers,
      now: () => fixedNow,
      dispatcher: (dto, context) => {
        calls.push({ dto, context });
        return {
          eventClass: context.request.event_class,
          route: {
            name: 'periodic',
            eventClasses: [context.request.event_class],
            stage: 'build.periodic',
          },
          stage: 'building',
          builderReady: false,
        };
      },
    }),
  });
  const envelope = submissionEnvelope();

  assert.deepEqual(await handler(sqsEvent(envelope, 'msg-dispatch')), {
    batchItemFailures: [],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].dto.eventClass, 'S-1299');
  assert.equal(repository.records[0].route.stage, 'build.periodic');
});

test('default dispatcher builds XML for promoted round-0 event families', async () => {
  const envelope = submissionEnvelope({ event_class: 'S-1000' });
  envelope.payload = {
    eventClass: 'S-1000',
    tenantId: envelope.tenant_id,
    sourceEventId: envelope.source.source_event_id,
    sourceEntityId: envelope.source.source_entity_id,
    environment: 'qualification',
    employerCnpj: '12345678000195',
    validityStart: '2026-01',
    legalName: 'Municipio Demo',
    taxClassification: '85',
  };

  const result = await dispatchByEventClass(envelope.payload, {
    request: envelope,
    occurredAt: fixedNow.toISOString(),
  });

  assert.equal(result.builderReady, true);
  assert.equal(result.builtXml.metadata.eventCode, 'S-1000');
  assert.equal(result.builtXml.eventIds.length, 1);
  assert.match(result.builtXml.xmlSha256, /^[0-9a-f]{64}$/u);
  assert.match(result.builtXml.xml, /<evtInfoEmpregador Id="ID/u);
});

test('duplicate request re-emits the prior outcome without inserting twice', async () => {
  const repository = new InMemorySubmissionRepository();
  const published = createRecordingPublishers();
  const handler = createSubmissionHandler({
    repository,
    publishers: published.publishers,
    now: () => fixedNow,
  });
  const envelope = submissionEnvelope();

  assert.deepEqual(await handler(sqsEvent(envelope, 'msg-first')), {
    batchItemFailures: [],
  });
  assert.deepEqual(await handler(sqsEvent(envelope, 'msg-duplicate')), {
    batchItemFailures: [],
  });

  assert.equal(repository.insertCount, 1);
  assert.equal(repository.records.length, 1);
  assert.equal(published.response.length, 2);
  assert.equal(published.response[1].envelope.payload.duplicate, true);
  assert.equal(published.spool.length, 2);
});

test('malformed JSON and unsupported version are terminal DLQ messages with no DB row', async () => {
  const repository = new InMemorySubmissionRepository();
  const published = createRecordingPublishers();
  const handler = createSubmissionHandler({
    repository,
    publishers: published.publishers,
    now: () => fixedNow,
  });
  const wrongVersion = {
    ...submissionEnvelope(),
    version: 'v2',
  };

  const result = await handler({
    Records: [
      { messageId: 'msg-malformed', body: '{bad-json' },
      { messageId: 'msg-wrong-version', body: JSON.stringify(wrongVersion) },
    ],
  });

  assert.deepEqual(result, { batchItemFailures: [] });
  assert.equal(repository.records.length, 0);
  assert.equal(published.dlq.length, 2);
  assert.equal(published.dlq[0].envelope.errors[0].code, 'ESOCIAL_MALFORMED_JSON');
  assert.equal(published.dlq[1].envelope.errors[0].code, 'ESOCIAL_UNSUPPORTED_VERSION');
});

test('contract-level payload validation is persisted as validation_failed and audited', async () => {
  const repository = new InMemorySubmissionRepository();
  const published = createRecordingPublishers();
  const handler = createSubmissionHandler({
    repository,
    publishers: published.publishers,
    now: () => fixedNow,
  });
  const envelope = submissionEnvelope();
  const invalid = {
    ...envelope,
    payload: {
      ...envelope.payload,
      eventClass: 'S-1200',
    },
  };

  const result = await handler(sqsEvent(invalid, 'msg-validation'));

  assert.deepEqual(result, { batchItemFailures: [] });
  assert.equal(repository.records[0]?.status, 'validation_failed');
  assert.equal(published.response[0].envelope.status, 'validation_failed');
  assert.equal(published.audit.length, 1);
  assert.equal(published.audit[0].envelope.status, 'validation_failed');
  assert.equal(published.spool.length, 1);
  assert.equal(published.spool[0].envelope.status_transition.to, 'validation_failed');
  assert.equal(published.spool[0].envelope.errors[0].code, 'ESOCIAL_DTO_INVALID');
});

test('retry-classified outbound failure returns only the failed SQS item', async () => {
  const repository = new InMemorySubmissionRepository();
  const published = createRecordingPublishers({
    response: () => new Error('response queue temporarily unavailable'),
  });
  const handler = createSubmissionHandler({
    repository,
    publishers: published.publishers,
    now: () => fixedNow,
  });

  const result = await handler(sqsEvent(submissionEnvelope(), 'msg-retry'));

  assert.deepEqual(result, {
    batchItemFailures: [{ itemIdentifier: 'msg-retry' }],
  });
  assert.equal(published.retry.length, 1);
  assert.equal(published.retry[0].envelope.status, 'retry');
  assert.equal(published.dlq.length, 0);
});

test('DLQ-classified terminal failure publishes DLQ and does not request redrive', async () => {
  const repository = new InMemorySubmissionRepository();
  const terminal = new TerminalSubmissionError('non-retryable publisher failure', [
    {
      category: 'configuration',
      code: 'ESOCIAL_TERMINAL_PUBLISH_FAILURE',
      message: 'non-retryable publisher failure',
      retryable: false,
    },
  ]);
  const published = createRecordingPublishers({
    response: () => terminal,
  });
  const handler = createSubmissionHandler({
    repository,
    publishers: published.publishers,
    now: () => fixedNow,
  });

  const result = await handler(sqsEvent(submissionEnvelope(), 'msg-terminal'));

  assert.deepEqual(result, { batchItemFailures: [] });
  assert.equal(published.dlq.length, 1);
  assert.equal(published.dlq[0].envelope.status, 'dlq');
  assert.equal(published.spool.length, 0);
});

class InMemorySubmissionRepository {
  records = [];
  byIdempotency = new Map();
  insertCount = 0;

  async persist(command) {
    const key = command.envelope['idempotency-key'];
    const existing = this.byIdempotency.get(key);

    if (existing) {
      return {
        ...existing,
        inserted: false,
        errors: command.errors,
      };
    }

    const record = {
      inserted: true,
      messageId: randomUUID(),
      batchId: randomUUID(),
      eventRecordId: randomUUID(),
      status: command.status,
      route: command.route,
      createdAt: fixedNow.toISOString(),
      updatedAt: fixedNow.toISOString(),
      errors: command.errors,
    };

    this.insertCount += 1;
    this.records.push(record);
    this.byIdempotency.set(key, record);
    return record;
  }
}

function createRecordingPublishers(failures = {}) {
  const published = {
    response: [],
    spool: [],
    audit: [],
    retry: [],
    dlq: [],
  };

  return {
    ...published,
    publishers: {
      response: publisher('response', published, failures),
      spool: publisher('spool', published, failures),
      audit: publisher('audit', published, failures),
      retry: publisher('retry', published, failures),
      dlq: publisher('dlq', published, failures),
    },
  };
}

function publisher(family, published, failures) {
  return {
    async publish(command) {
      const failure = failures[family]?.(command);
      if (failure) throw failure;
      published[family].push(command);
    },
  };
}

function sqsEvent(envelope, messageId) {
  return {
    Records: [
      {
        messageId,
        body: JSON.stringify(envelope),
      },
    ],
  };
}

function submissionEnvelope(overrides = {}) {
  const tenantId = overrides.tenant_id ?? '00000000-0000-4000-8000-000000000101';
  const environment = overrides.environment ?? 'QUALIFICATION';
  const eventClass = overrides.event_class ?? 'S-1299';
  const sourceEventId = overrides.source_event_id ?? '10000000-0000-4000-8000-000000000001';
  const sourceEntityId = overrides.source_entity_id ?? 'payroll-run-2026-05';
  const payloadHash = `sha256:${createHash('sha256')
    .update(`${tenantId}:${eventClass}:${sourceEventId}`)
    .digest('hex')}`;
  const idempotency = buildEsocialIdempotencyKey({
    family: 'request',
    tenant_id: tenantId,
    environment,
    event_class: eventClass,
    source_event_id: sourceEventId,
    source_entity_id: sourceEntityId,
    competence: '2026-05',
    payload_hash: payloadHash,
  });

  return {
    version: 'v1',
    family: 'request',
    'request-id': overrides['request-id'] ?? randomUUID(),
    'correlation-id': overrides['correlation-id'] ?? randomUUID(),
    'idempotency-key': overrides['idempotency-key'] ?? idempotency.value,
    created_at: fixedNow.toISOString(),
    tenant_id: tenantId,
    environment,
    event_class: eventClass,
    source: {
      source_event_id: sourceEventId,
      source_entity_id: sourceEntityId,
      payroll_run_id: 'payroll-2026-05',
    },
    kind: 'submit',
    payload_hash: payloadHash,
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.submit.response',
    'dead-letter-topic': 'sgp.esocial.dlq',
    payload: {
      tenantId,
      sourceEventId,
      sourceEntityId,
      environment: environment === 'PRODUCTION' ? 'production' : 'qualification',
      eventClass,
      employerCnpj: '12345678000195',
      competence: '2026-05',
      payrollRunId: 'payroll-2026-05',
      pendingPeriodicEvents: [],
      acceptedEventCounts: {
        remuneration: 25,
        payments: 25,
      },
    },
  };
}
