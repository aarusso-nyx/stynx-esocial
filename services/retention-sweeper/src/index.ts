import { createHash } from 'node:crypto';

export type RetentionCandidate = Readonly<{
  tableName: 'audit_event_log' | 'event_record' | 'dlq_item';
  rowId: string;
  tenantId: string;
  expiresAt: string;
  rowHash: string;
}>;

export type RetentionPendingBatch = Readonly<{
  batchId: string;
  tenantId: string;
  status: 'pending';
  candidates: readonly RetentionCandidate[];
  pendingAuditKind: 'retention.pending';
  batchHash: string;
  createdAt: string;
}>;

export type LgpdApproval = Readonly<{
  batchId: string;
  approverRole: string;
  approverActor: string;
  approvedAt: string;
}>;

export type RetentionExpireResult = Readonly<{
  batchId: string;
  tenantId: string;
  status: 'expired' | 'waiting_approval';
  deletedRows: number;
  auditKind: 'retention.expire' | 'retention.pending';
  merkleHash: string;
}>;

export function planRetentionBatch(input: Readonly<{
  batchId: string;
  tenantId: string;
  candidates: readonly RetentionCandidate[];
  now: Date;
}>): RetentionPendingBatch | undefined {
  const expired = input.candidates.filter(
    (candidate) =>
      candidate.tenantId === input.tenantId &&
      Date.parse(candidate.expiresAt) < input.now.getTime(),
  );
  if (expired.length === 0) return undefined;

  return {
    batchId: input.batchId,
    tenantId: input.tenantId,
    status: 'pending',
    candidates: expired,
    pendingAuditKind: 'retention.pending',
    batchHash: hashBatch(input.batchId, expired),
    createdAt: input.now.toISOString(),
  };
}

export function expireApprovedRetentionBatch(input: Readonly<{
  batch: RetentionPendingBatch;
  approvals: readonly LgpdApproval[];
}>): RetentionExpireResult {
  const approved = input.approvals.some(
    (approval) =>
      approval.batchId === input.batch.batchId &&
      approval.approverRole === 'Data Protection Officer',
  );
  if (!approved) {
    return {
      batchId: input.batch.batchId,
      tenantId: input.batch.tenantId,
      status: 'waiting_approval',
      deletedRows: 0,
      auditKind: 'retention.pending',
      merkleHash: hashBatch(input.batch.batchId, input.batch.candidates),
    };
  }

  return {
    batchId: input.batch.batchId,
    tenantId: input.batch.tenantId,
    status: 'expired',
    deletedRows: input.batch.candidates.length,
    auditKind: 'retention.expire',
    merkleHash: hashBatch(input.batch.batchId, input.batch.candidates),
  };
}

function hashBatch(
  batchId: string,
  candidates: readonly RetentionCandidate[],
): string {
  const canonical = candidates
    .map((candidate) => [
      candidate.tableName,
      candidate.rowId,
      candidate.tenantId,
      candidate.expiresAt,
      candidate.rowHash,
    ].join(':'))
    .sort()
    .join('|');
  return `sha256:${createHash('sha256')
    .update(`${batchId}:${canonical}`)
    .digest('hex')}`;
}
