import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildEsocialIdempotencyKey } from '../../packages/contracts/dist/index.js';
import {
  buildS1200,
  buildS1299,
  parseTotalizerXml,
} from '../../packages/domain/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;
const tenantId = '00000000-0000-4000-8000-000000000777';
const competence = '2026-01';

test('consumer payroll cycle round-trips remuneration, closure, and totalizer returns in order', () => {
  const s1200 = { ...fixture('s1200.dto.json'), tenantId, competence };
  const s1299 = { ...fixture('s1299.dto.json'), tenantId, competence };
  const auditLog = [];

  const remuneration = buildS1200(s1200);
  const remunerationKey = idempotencyFor(s1200, remuneration.xmlSha256);
  const remunerationProtocol = mockSoapSubmit('S-1200', remuneration.xml);
  auditLog.push(audit('S-1200', 'submission', remunerationKey, remunerationProtocol));

  const closure = buildS1299(s1299);
  const closureKey = idempotencyFor(s1299, closure.xmlSha256);
  const closureProtocol = mockSoapSubmit('S-1299', closure.xml);
  auditLog.push(audit('S-1299', 'submission', closureKey, closureProtocol));

  const basesTrab = parseTotalizerXml(returnGolden('s5001-totalizer.golden.xml'));
  auditLog.push(audit('S-5001', 'return', remunerationKey, basesTrab.sourceEventReceipt));

  const cs = parseTotalizerXml(returnGolden('s5011-totalizer.golden.xml'));
  auditLog.push(audit('S-5011', 'return', closureKey, cs.sourceEventReceipt));

  assert.deepEqual(auditLog.map((entry) => entry.eventClass), [
    'S-1200',
    'S-1299',
    'S-5001',
    'S-5011',
  ]);
  assert.equal(auditLog.length, 4);
  assert.equal(auditLog.every((entry) => entry.tenantId === tenantId), true);
  assert.equal(auditLog.every((entry) => entry.competence === competence), true);
  assert.equal(auditLog[0].idempotencyKey, auditLog[2].idempotencyKey);
  assert.equal(auditLog[1].idempotencyKey, auditLog[3].idempotencyKey);
  assert.match(auditLog[0].externalReference, /^LOCAL-S-1200-/u);
  assert.match(auditLog[1].externalReference, /^LOCAL-S-1299-/u);
  assert.equal(auditLog[2].externalReference, basesTrab.sourceEventReceipt);
  assert.equal(auditLog[3].externalReference, cs.sourceEventReceipt);
});

function idempotencyFor(dto, payloadHash) {
  return buildEsocialIdempotencyKey({
    family: 'request',
    tenant_id: dto.tenantId,
    environment: 'QUALIFICATION',
    event_class: dto.eventClass,
    source_event_id: dto.sourceEventId,
    source_entity_id: dto.sourceEntityId,
    source_entity_ids: dto.sourceEntityIds,
    competence: dto.competence,
    payload_hash: payloadHash,
  }).value;
}

function mockSoapSubmit(eventClass, xml) {
  return `LOCAL-${eventClass}-${createHash('sha256').update(xml, 'utf8').digest('hex').slice(0, 16).toUpperCase()}`;
}

function audit(eventClass, stage, idempotencyKey, externalReference) {
  return {
    tenantId,
    competence,
    eventClass,
    stage,
    idempotencyKey,
    externalReference,
  };
}

function fixture(fileName) {
  return JSON.parse(readFileSync(join(root, 'tests/golden/fixtures', fileName), 'utf8'));
}

function returnGolden(fileName) {
  return readFileSync(join(root, 'docs/templates/golden/returns', fileName), 'utf8');
}
