import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const evidenceDir = join(root, 'docs/release/1.2.0/audit');
const chainFile = join(evidenceDir, 'sample-chain.json');
const resultFile = join(evidenceDir, 'verification.json');

mkdirSync(evidenceDir, { recursive: true });
if (!exists(chainFile)) {
  const rows = [];
  for (const seed of [
    ['audit-1', null, 'submission.received'],
    ['audit-2', null, 'xml.signed'],
    ['audit-3', null, 'soap.response.parsed'],
  ]) {
    const row = {
      audit_event_id: seed[0],
      tenant_id: '00000000-0000-4000-8000-000000000101',
      event_type: seed[2],
      occurred_at: '2026-05-06T12:00:00.000Z',
      payload_hash: `sha256:${seed[0]}`,
      prev_hash: rows.at(-1)?.row_hash ?? null,
      row_hash: null,
    };
    row.row_hash = hashRow({ ...row, row_hash: undefined });
    rows.push(row);
  }
  writeFileSync(chainFile, `${JSON.stringify({ rows }, null, 2)}\n`);
}

const chain = JSON.parse(readFileSync(chainFile, 'utf8'));
const failures = [];
let previousHash = null;

for (const row of chain.rows) {
  if (row.prev_hash !== previousHash) {
    failures.push(`${row.audit_event_id} prev_hash mismatch`);
  }
  const expected = hashRow({ ...row, row_hash: undefined });
  if (row.row_hash !== expected) {
    failures.push(`${row.audit_event_id} row_hash mismatch`);
  }
  previousHash = row.row_hash;
}

const result = {
  status: failures.length === 0 ? 'passed' : 'failed',
  rows: chain.rows.length,
  rootHash: previousHash,
  failures,
};
writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(`[audit:verify] ${result.status} ${chain.rows.length} row chain`);

if (failures.length > 0) {
  process.exit(1);
}

function hashRow(row) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(row))
    .digest('hex')}`;
}

function exists(fileName) {
  try {
    readFileSync(fileName, 'utf8');
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}
