import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { createReturnHandler } from '../dist/handler.js';

const root = new URL('../../..', import.meta.url).pathname;
const now = new Date('2026-05-05T12:00:00.000Z');
const tenantId = '00000000-0000-4000-8000-000000000807';
const eventRecordId = '00000000-0000-4000-8000-000000000808';
const batchId = '00000000-0000-4000-8000-000000000809';
const protocol = '1.2.202605.000000000000000001';

test('return handler accepts protocol success, resolves origin, persists audit, and emits spool', async () => {
  const harness = createHarness();
  const response = await harness.handler(sqsEvent(returnEnvelope(protocolXml(), 'protocol-ok', {
    eventRecordId: undefined,
    batchId: undefined,
    protocolNumber: protocol,
  })));

  assert.deepEqual(response.batchItemFailures, []);
  assert.equal(harness.repository.origins.length, 1);
  assert.equal(harness.repository.persisted[0]?.status, 'accepted');
  assert.equal(harness.repository.persisted[0]?.parsed.kind, 'protocol');
  assert.equal(harness.publishers.spool.published.length, 1);
  assert.equal(harness.publishers.audit.published.length, 1);
  assert.equal(harness.publishers.spool.published[0].envelope.response_payload.protocol_number, protocol);
  assert.equal(harness.publishers.audit.published[0].envelope.target.type, 'esocial.event_record');
});

test('return handler maps regulatory rejection to rejected status and classification metadata', async () => {
  const harness = createHarness();
  const response = await harness.handler(sqsEvent(returnEnvelope(processingXml('402'), 'rejected')));

  assert.deepEqual(response.batchItemFailures, []);
  const command = harness.repository.persisted[0];
  assert.equal(command.status, 'rejected');
  assert.equal(command.classification.responseCode, '402');
  assert.equal(command.errors[0]?.category, 'regulatory');
  assert.equal(command.errors[0]?.code, '187');
  assert.equal(harness.publishers.spool.published[0].envelope.status_transition.to, 'rejected');
});

test('return handler maps SOAP fault to failed transport audit status', async () => {
  const harness = createHarness();
  const response = await harness.handler(
    sqsEvent(returnEnvelope(
      '<Envelope><Body><Fault><faultstring>temporary SOAP fault</faultstring></Fault></Body></Envelope>',
      'soap-fault',
    )),
  );

  assert.deepEqual(response.batchItemFailures, []);
  const command = harness.repository.persisted[0];
  assert.equal(command.status, 'failed');
  assert.equal(command.errors[0]?.category, 'transport');
  assert.equal(command.errors[0]?.code, 'ESOCIAL_SOAP_FAULT');
  assert.equal(harness.publishers.audit.published[0].envelope.status, 'failed');
});

test('return handler maps malformed XML to failed schema status without totalizer rows', async () => {
  const harness = createHarness();
  const response = await harness.handler(sqsEvent(returnEnvelope('<eSocial>', 'malformed')));

  assert.deepEqual(response.batchItemFailures, []);
  const command = harness.repository.persisted[0];
  assert.equal(command.status, 'failed');
  assert.equal(command.parsed, null);
  assert.equal(command.totalizerClass, undefined);
  assert.equal(command.errors[0]?.category, 'schema');
  assert.equal(command.errors[0]?.code, 'MALFORMED_XML');
  assert.equal(harness.repository.totalizers.length, 0);
});

test('return handler persists every S-50xx totalizer variant and emits totalizer spool payloads', async () => {
  const cases = [
    ['s5001-totalizer.golden.xml', 'S-5001'],
    ['s5002-totalizer.golden.xml', 'S-5002'],
    ['s5011-totalizer.golden.xml', 'S-5011'],
    ['s5012-totalizer.golden.xml', 'S-5012'],
    ['s5013-totalizer.golden.xml', 'S-5013'],
  ];

  for (const [fileName, expectedClass] of cases) {
    const harness = createHarness();
    const response = await harness.handler(
      sqsEvent(returnEnvelope(liftedParserFixture(fileName), `totalizer-${expectedClass}`, {
        sourceEventClass: 'S-1299',
      })),
    );

    assert.deepEqual(response.batchItemFailures, [], fileName);
    const command = harness.repository.persisted[0];
    assert.equal(command.status, 'accepted', fileName);
    assert.equal(command.totalizerClass, expectedClass, fileName);
    assert.equal(harness.repository.totalizers[0]?.totalizerClass, expectedClass, fileName);
    const spool = harness.publishers.spool.published[0].envelope;
    assert.equal(spool.kind, 'retorno', fileName);
    assert.equal(spool.response_payload.return_kind, 'totalizer', fileName);
    assert.equal(spool.response_payload.totalizer_class, expectedClass, fileName);
  }
});

test('return handler maps unknown regulatory codes to failed regulatory gap audit', async () => {
  const harness = createHarness();
  const response = await harness.handler(sqsEvent(returnEnvelope(processingXml('999'), 'unknown-code')));

  assert.deepEqual(response.batchItemFailures, []);
  const command = harness.repository.persisted[0];
  assert.equal(command.status, 'failed');
  assert.equal(command.errors[0]?.category, 'regulatory');
  assert.equal(command.errors[0]?.code, 'ESOCIAL_RESPONSE_CODE_UNMAPPED');
  assert.deepEqual(command.auditFlags, ['unknown_regulatory_code']);
  assert.deepEqual(
    harness.publishers.audit.published[0].envelope.after.audit_flags,
    ['unknown_regulatory_code'],
  );
});

function createHarness() {
  const repository = new InMemoryReturnRepository();
  const publishers = {
    spool: new CapturingPublisher(),
    audit: new CapturingPublisher(),
    dlq: new CapturingPublisher(),
  };
  return {
    repository,
    publishers,
    handler: createReturnHandler({
      repository,
      publishers,
      now: () => now,
    }),
  };
}

class InMemoryReturnRepository {
  persisted = [];
  totalizers = [];
  origins = [];

  async classifyResponseCode(input) {
    const mappings = {
      '201': {
        canonicalStatus: 'ACCEPTED',
        retryable: false,
        category: 'ESOCIAL_RULE',
        description: 'Accepted by local return handler classification.',
        operatorActionRequired: false,
      },
      '402': {
        canonicalStatus: 'REJECTED',
        retryable: false,
        category: 'ESOCIAL_RULE',
        description: 'Rejected by local return handler classification.',
        operatorActionRequired: true,
      },
    };
    const mapping = mappings[input.responseCode];
    return mapping ? { responseCode: input.responseCode, ...mapping } : undefined;
  }

  async resolveOrigin(input) {
    this.origins.push(input);
    return {
      eventRecordId,
      batchId,
      previousStatus: 'sent',
      sourceEventClass: 'S-1299',
      competence: '2026-01',
    };
  }

  async persist(command) {
    this.persisted.push(command);
    if (command.totalizerClass) {
      this.totalizers.push(command);
    }
    return {
      inserted: true,
      messageId: `return-message-${this.persisted.length}`,
      eventRecordId: command.eventRecordId,
      batchId: command.batchId,
      status: command.status,
      previousStatus: command.previousStatus,
      responseHash: command.responseHash,
      protocol: command.protocol,
      receipt: command.receipt,
      totalizerId: command.totalizerClass ? `totalizer-${this.persisted.length}` : undefined,
      totalizerClass: command.totalizerClass,
      competence: command.competence,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }
}

class CapturingPublisher {
  published = [];

  async publish(command) {
    this.published.push(command);
  }
}

function sqsEvent(envelope) {
  return {
    Records: [
      {
        messageId: envelope['request-id'],
        body: JSON.stringify(envelope),
      },
    ],
  };
}

function returnEnvelope(rawResponseXml, suffix, payload = {}) {
  return {
    version: 'v1',
    family: 'request',
    'request-id': `req-${suffix}`,
    'correlation-id': `corr-${suffix}`,
    'idempotency-key': `idem-${suffix}`,
    created_at: now.toISOString(),
    tenant_id: tenantId,
    environment: 'QUALIFICATION',
    event_class: 'S-1299',
    source: {
      source_event_id: `source-${suffix}`,
      payroll_run_id: 'payroll-2026-01',
      source_entity_id: 'closure-2026-01',
      source_system: 'sgp',
    },
    kind: 'retorno',
    payload_hash: `sha256:${suffix}`,
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.spool.update',
    'dead-letter-topic': 'sgp.esocial.dlq',
    payload: {
      eventRecordId,
      batchId,
      previousStatus: 'sent',
      rawResponseXml,
      ...payload,
    },
  };
}

function liftedParserFixture(fileName) {
  return readFileSync(
    join(
      root,
      'packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__',
      fileName,
    ),
    'utf8',
  );
}

function protocolXml() {
  return `
  <eSocial>
    <retornoEnvioLoteEventos>
      <status>
        <cdResposta>201</cdResposta>
        <descResposta>Lote recebido com sucesso.</descResposta>
      </status>
      <dadosRecepcaoLote>
        <protocoloEnvio>${protocol}</protocoloEnvio>
      </dadosRecepcaoLote>
    </retornoEnvioLoteEventos>
  </eSocial>`;
}

function processingXml(code) {
  const success = code === '201';
  return `
  <eSocial>
    <retornoProcessamentoLoteEventos>
      <status>
        <cdResposta>201</cdResposta>
        <descResposta>Lote Processado com Sucesso.</descResposta>
      </status>
      <dadosRecepcaoLote>
        <protocoloEnvio>${protocol}</protocoloEnvio>
      </dadosRecepcaoLote>
      <retornoEventos>
        <evento Id="IDES09SUCCESS000000000000000000001">
          <retornoEvento>
            <eSocial>
              <retornoEvento>
                <processamento>
                  <cdResposta>${code}</cdResposta>
                  <descResposta>${success ? 'Sucesso.' : 'Schema invalido.'}</descResposta>
                  ${
                    success
                      ? ''
                      : '<ocorrencias><ocorrencia><tipo>1</tipo><codigo>187</codigo><descricao>Schema invalido.</descricao><localizacao>/eSocial/evtInfoEmpregador</localizacao></ocorrencia></ocorrencias>'
                  }
                </processamento>
                ${
                  success
                    ? '<recibo><nrRecibo>1.1.0000000000000000001</nrRecibo></recibo>'
                    : ''
                }
              </retornoEvento>
            </eSocial>
          </retornoEvento>
        </evento>
      </retornoEventos>
    </retornoProcessamentoLoteEventos>
  </eSocial>`;
}
