import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  handleLgpdRequest,
} from '../../services/lgpd/dist/index.js';
import {
  expireApprovedRetentionBatch,
  planRetentionBatch,
} from '../../services/retention-sweeper/dist/index.js';

const tenantId = '00000000-0000-4000-8000-000000000611';
const subjectDocument = '123.456.789-09';
const now = new Date('2026-05-06T12:00:00.000Z');

test('LGPD access/export/erase endpoints are role-gated, audited, tenant-scoped, and redacted', async () => {
  const repository = new InMemoryLgpdRepository([
    {
      tenantId,
      subjectDocument,
      recordId: 'event-1',
      recordType: 'event_record',
      eventClass: 'S-2200',
      payload: {
        cpf: subjectDocument,
        salary: 12345.67,
        xml: '<eSocial><evtAdmissao>personal</evtAdmissao></eSocial>',
      },
    },
    {
      tenantId: '00000000-0000-4000-8000-000000000612',
      subjectDocument,
      recordId: 'event-other-tenant',
      recordType: 'event_record',
      payload: { cpf: subjectDocument },
    },
  ]);

  const denied = await handleLgpdRequest(repository, {
    action: 'access',
    tenantId,
    subjectDocument,
    actorId: 'operator:readonly',
    roles: ['dlq:read'],
    now,
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(repository.audits.at(-1).kind, 'auth.denied');

  const access = await handleLgpdRequest(repository, {
    action: 'access',
    tenantId,
    subjectDocument,
    actorId: 'operator:privacy',
    roles: ['lgpd:read'],
    now,
  });
  assert.equal(access.statusCode, 200);
  assert.equal(access.body.records.length, 1);
  assert.equal(access.body.records[0].payload.cpf, '123.***.***-09');
  assert.equal(access.body.records[0].payload.salary, '[REDACTED_SALARY]');
  assert.equal(access.body.records[0].payload.xml, '[REDACTED_XML_PAYLOAD]');

  const exported = await handleLgpdRequest(repository, {
    action: 'export',
    tenantId,
    subjectDocument,
    actorId: 'operator:privacy',
    roles: ['lgpd:export'],
    now,
  });
  assert.equal(exported.body.export.format, 'application/json');
  assert.equal(exported.body.export.records.length, 1);

  const erased = await handleLgpdRequest(repository, {
    action: 'erase',
    tenantId,
    subjectDocument,
    actorId: 'operator:privacy',
    roles: ['lgpd:erase'],
    now,
  });
  assert.equal(erased.statusCode, 202);
  assert.equal(erased.body.erasedRecords, 1);
  assert.equal(repository.records[0].erasedAt, now.toISOString());
  assert.deepEqual(
    repository.audits.map((audit) => audit.kind),
    ['auth.denied', 'lgpd.access', 'lgpd.export', 'lgpd.erase'],
  );
});

test('retention sweeper writes pending batches and refuses destructive delete until DPO approval', () => {
  const batch = planRetentionBatch({
    batchId: '00000000-0000-4000-8000-000000000691',
    tenantId,
    now,
    candidates: [
      {
        tableName: 'event_record',
        rowId: 'event-1',
        tenantId,
        expiresAt: '2026-05-05T00:00:00.000Z',
        rowHash: 'sha256:event-1',
      },
      {
        tableName: 'dlq_item',
        rowId: 'dlq-future',
        tenantId,
        expiresAt: '2026-06-01T00:00:00.000Z',
        rowHash: 'sha256:future',
      },
    ],
  });
  assert.equal(batch.status, 'pending');
  assert.equal(batch.pendingAuditKind, 'retention.pending');
  assert.equal(batch.candidates.length, 1);
  assert.match(batch.batchHash, /^sha256:[a-f0-9]{64}$/u);

  const waiting = expireApprovedRetentionBatch({
    batch,
    approvals: [],
  });
  assert.equal(waiting.status, 'waiting_approval');
  assert.equal(waiting.deletedRows, 0);
  assert.equal(waiting.auditKind, 'retention.pending');

  const approved = expireApprovedRetentionBatch({
    batch,
    approvals: [
      {
        batchId: batch.batchId,
        approverRole: 'Data Protection Officer',
        approverActor: 'dpo:tbd',
        approvedAt: now.toISOString(),
      },
    ],
  });
  assert.equal(approved.status, 'expired');
  assert.equal(approved.deletedRows, 1);
  assert.equal(approved.auditKind, 'retention.expire');
  assert.equal(approved.merkleHash, batch.batchHash);
});

class InMemoryLgpdRepository {
  records;
  audits = [];

  constructor(records) {
    this.records = records.map((record) => ({ ...record }));
  }

  async findSubjectRecords(input) {
    return this.records.filter((record) =>
      record.tenantId === input.tenantId &&
      record.subjectDocument === input.subjectDocument);
  }

  async redactSubject(input) {
    const records = await this.findSubjectRecords(input);
    for (const record of records) {
      record.payload = {
        ...record.payload,
        cpf: '[ERASED_BY_LGPD_REQUEST]',
        cnpj: '[ERASED_BY_LGPD_REQUEST]',
        salary: '[ERASED_BY_LGPD_REQUEST]',
      };
      record.erasedAt = input.erasedAt;
    }
    return records;
  }

  async appendAudit(event) {
    this.audits.push(event);
  }
}
