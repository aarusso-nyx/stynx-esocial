import { createHash } from 'node:crypto';

import { redactForLog } from '@esocial/domain';

export type LgpdAction = 'access' | 'erase' | 'export';

export type LgpdSubjectRecord = Readonly<{
  tenantId: string;
  subjectDocument: string;
  recordId: string;
  recordType: 'event_record' | 'audit_event_log' | 'dlq_item' | 'totalizer';
  eventClass?: string | undefined;
  payload: Record<string, unknown>;
  erasedAt?: string | undefined;
}>;

export type LgpdAuditEvent = Readonly<{
  kind: `lgpd.${LgpdAction}` | 'auth.denied';
  tenantId: string;
  actorId: string;
  subjectHash: string;
  status: 'accepted' | 'denied' | 'completed';
  occurredAt: string;
  details: Record<string, unknown>;
}>;

export type LgpdRepository = Readonly<{
  findSubjectRecords(input: Readonly<{
    tenantId: string;
    subjectDocument: string;
  }>): Promise<readonly LgpdSubjectRecord[]>;
  redactSubject(input: Readonly<{
    tenantId: string;
    subjectDocument: string;
    erasedAt: string;
  }>): Promise<readonly LgpdSubjectRecord[]>;
  appendAudit(event: LgpdAuditEvent): Promise<void>;
}>;

export type LgpdGatewayRequest = Readonly<{
  action: LgpdAction;
  tenantId: string;
  subjectDocument: string;
  actorId?: string | undefined;
  roles?: readonly string[] | undefined;
  now?: Date | undefined;
}>;

export type LgpdGatewayResponse = Readonly<{
  statusCode: 200 | 202 | 403;
  body: Readonly<{
    status: 'ok' | 'accepted' | 'denied';
    tenantId: string;
    subjectHash: string;
    records?: readonly Record<string, unknown>[] | undefined;
    export?: {
      format: 'application/json';
      records: readonly Record<string, unknown>[];
    } | undefined;
    erasedRecords?: number | undefined;
  }>;
}>;

const REQUIRED_ROLE: Record<LgpdAction, string> = {
  access: 'lgpd:read',
  erase: 'lgpd:erase',
  export: 'lgpd:export',
};

export async function handleLgpdRequest(
  repository: LgpdRepository,
  request: LgpdGatewayRequest,
): Promise<LgpdGatewayResponse> {
  const now = (request.now ?? new Date()).toISOString();
  const actorId = request.actorId ?? 'anonymous';
  const subjectHash = hashSubject(request.tenantId, request.subjectDocument);
  if (!hasRole(request.roles ?? [], REQUIRED_ROLE[request.action])) {
    await repository.appendAudit({
      kind: 'auth.denied',
      tenantId: request.tenantId,
      actorId,
      subjectHash,
      status: 'denied',
      occurredAt: now,
      details: { action: `lgpd.${request.action}` },
    });
    return {
      statusCode: 403,
      body: {
        status: 'denied',
        tenantId: request.tenantId,
        subjectHash,
      },
    };
  }

  if (request.action === 'erase') {
    const erased = await repository.redactSubject({
      tenantId: request.tenantId,
      subjectDocument: request.subjectDocument,
      erasedAt: now,
    });
    await audit(repository, request, subjectHash, actorId, now, {
      erasedRecords: erased.length,
    });
    return {
      statusCode: 202,
      body: {
        status: 'accepted',
        tenantId: request.tenantId,
        subjectHash,
        erasedRecords: erased.length,
      },
    };
  }

  const records = await repository.findSubjectRecords({
    tenantId: request.tenantId,
    subjectDocument: request.subjectDocument,
  });
  const redacted = records.map((record) => redactRecord(record));
  await audit(repository, request, subjectHash, actorId, now, {
    recordCount: redacted.length,
  });

  return {
    statusCode: 200,
    body: request.action === 'export'
      ? {
          status: 'ok',
          tenantId: request.tenantId,
          subjectHash,
          export: {
            format: 'application/json',
            records: redacted,
          },
        }
      : {
          status: 'ok',
          tenantId: request.tenantId,
          subjectHash,
          records: redacted,
        },
  };
}

function redactRecord(record: LgpdSubjectRecord): Record<string, unknown> {
  return redactForLog({
    recordId: record.recordId,
    recordType: record.recordType,
    eventClass: record.eventClass,
    payload: record.payload,
    erasedAt: record.erasedAt,
  });
}

function audit(
  repository: LgpdRepository,
  request: LgpdGatewayRequest,
  subjectHash: string,
  actorId: string,
  occurredAt: string,
  details: Record<string, unknown>,
): Promise<void> {
  return repository.appendAudit({
    kind: `lgpd.${request.action}`,
    tenantId: request.tenantId,
    actorId,
    subjectHash,
    status: 'completed',
    occurredAt,
    details,
  });
}

function hasRole(roles: readonly string[], required: string): boolean {
  return roles.includes(required) || roles.includes('lgpd:admin');
}

function hashSubject(tenantId: string, subjectDocument: string): string {
  return `sha256:${createHash('sha256')
    .update(`${tenantId}:${subjectDocument.replace(/\D/gu, '')}`)
    .digest('hex')}`;
}
