import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ReturnProcessor,
} from '../../packages/domain/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;
const now = new Date('2026-05-05T12:00:00.000Z');
const tenantId = '00000000-0000-4000-8000-000000000707';
const eventRecordId = '00000000-0000-4000-8000-000000000708';
const batchId = '00000000-0000-4000-8000-000000000709';

test('return processor persists accepted processing returns and publishes idempotent spool/audit updates', async () => {
  const harness = createHarness();
  const result = await harness.processor.process(returnEnvelope(processingXml('201')));

  assert.equal(result.record.inserted, true);
  assert.equal(result.record.status, 'accepted');
  assert.equal(result.record.eventRecordId, eventRecordId);
  assert.equal(result.record.batchId, batchId);
  assert.equal(result.record.protocol, '1.2.202605.000000000000000001');
  assert.equal(result.record.receipt, '1.1.0000000000000000001');
  assert.equal(harness.repository.persisted[0]?.status, 'accepted');

  assert.equal(harness.publishers.spool.published.length, 1);
  assert.equal(harness.publishers.audit.published.length, 1);
  const spool = harness.publishers.spool.published[0].envelope;
  assert.equal(spool.family, 'spool');
  assert.equal(spool.kind, 'retorno');
  assert.equal(spool.status_transition.from, 'sent');
  assert.equal(spool.status_transition.to, 'accepted');
  assert.equal(spool.response_payload.protocol_number, result.record.protocol);
  assert.equal(spool.response_payload.receipt_number, result.record.receipt);
  assert.match(spool.response_hash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(spool.response_payload.event_record_id, eventRecordId);
});

test('return processor maps regulatory rejection and SOAP fault without SGP table writes', async () => {
  const rejected = createHarness();
  const rejectionResult = await rejected.processor.process(
    returnEnvelope(processingXml('402'), 'return-rejected'),
  );
  assert.equal(rejectionResult.record.status, 'rejected');
  assert.equal(rejectionResult.spoolUpdate.status_transition.to, 'rejected');
  assert.equal(rejectionResult.spoolUpdate.errors[0]?.code, '187');

  const faulted = createHarness();
  const faultResult = await faulted.processor.process(
    returnEnvelope(
      '<Envelope><Body><Fault><faultstring>temporary SOAP fault</faultstring></Fault></Body></Envelope>',
      'return-fault',
    ),
  );
  assert.equal(faultResult.record.status, 'failed');
  assert.equal(faultResult.spoolUpdate.status_transition.to, 'failed');
  assert.equal(faultResult.spoolUpdate.errors[0]?.code, 'ESOCIAL_SOAP_FAULT');
});

test('return processor maps malformed XML and unknown regulatory codes to failed audit outcomes', async () => {
  const malformed = createHarness();
  const malformedResult = await malformed.processor.process(
    returnEnvelope('<eSocial>', 'return-malformed'),
  );
  assert.equal(malformedResult.record.status, 'failed');
  assert.equal(malformedResult.spoolUpdate.errors[0]?.category, 'schema');
  assert.equal(malformedResult.spoolUpdate.errors[0]?.code, 'MALFORMED_XML');
  assert.equal(malformed.repository.persisted[0].totalizerClass, undefined);

  const unknown = createHarness();
  const unknownResult = await unknown.processor.process(
    returnEnvelope(processingXml('999'), 'return-unknown'),
  );
  assert.equal(unknownResult.record.status, 'failed');
  assert.equal(unknownResult.spoolUpdate.errors[0]?.category, 'regulatory');
  assert.equal(unknownResult.spoolUpdate.errors[0]?.code, 'ESOCIAL_RESPONSE_CODE_UNMAPPED');
  assert.deepEqual(unknown.repository.persisted[0].auditFlags, ['unknown_regulatory_code']);
  assert.deepEqual(unknownResult.auditEvent.after.audit_flags, ['unknown_regulatory_code']);
});

test('return processor persists totalizer traceability and publishes SGP-facing totalizer status', async () => {
  const harness = createHarness();
  const totalizerXml = returnGolden('s5011-totalizer.golden.xml');
  const result = await harness.processor.process(
    returnEnvelope(totalizerXml, 'return-totalizer', {
      sourceEventClass: 'S-1299',
      competence: '2026-01',
    }),
  );

  assert.equal(result.record.status, 'accepted');
  assert.equal(result.record.totalizerClass, 'S-5011');
  assert.equal(result.record.totalizerId, 'totalizer-1');
  assert.equal(result.record.eventRecordId, eventRecordId);
  assert.equal(result.record.batchId, batchId);
  assert.equal(result.record.receipt, result.parsed.totalizer.sourceEventReceipt);

  const command = harness.repository.persisted[0];
  assert.equal(command.totalizerClass, 'S-5011');
  assert.equal(command.sourceEventClass, 'S-1299');
  assert.equal(command.parsed.totalizer.kind, 'S-5011');

  const spool = harness.publishers.spool.published[0].envelope;
  assert.equal(spool.event_class, 'S-5011');
  assert.equal(spool.response_payload.totalizer_id, 'totalizer-1');
  assert.equal(spool.response_payload.totalizer_class, 'S-5011');
  assert.equal(spool.response_payload.batch_id, batchId);
  assert.equal(spool.response_payload.event_record_id, eventRecordId);
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
    processor: new ReturnProcessor({
      repository,
      publishers,
      now: () => now,
    }),
  };
}

class InMemoryReturnRepository {
  persisted = [];

  async classifyResponseCode(input) {
    const mappings = {
      '201': {
        canonicalStatus: 'ACCEPTED',
        retryable: false,
        category: 'ESOCIAL_RULE',
        description: 'Accepted by local return test classification.',
        operatorActionRequired: false,
      },
      '402': {
        canonicalStatus: 'REJECTED',
        retryable: false,
        category: 'ESOCIAL_RULE',
        description: 'Rejected by local return test classification.',
        operatorActionRequired: true,
      },
    };
    const mapping = mappings[input.responseCode];
    return mapping
      ? {
          responseCode: input.responseCode,
          ...mapping,
        }
      : undefined;
  }

  async persist(command) {
    this.persisted.push(command);
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

function returnEnvelope(rawResponseXml, suffix = 'return-ok', payload = {}) {
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

function returnGolden(fileName) {
  return readFileSync(
    join(root, 'docs/templates/golden/returns', fileName),
    'utf8',
  );
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
        <protocoloEnvio>1.2.202605.000000000000000001</protocoloEnvio>
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
