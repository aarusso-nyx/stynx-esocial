import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../..', import.meta.url).pathname;

test('submission Lambda uses contracts and emits spool updates without SGP DB strings', () => {
  const processor = readFileSync(
    join(root, 'packages/domain/src/submission/submission-processor.ts'),
    'utf8',
  );
  const handler = readFileSync(
    join(root, 'services/submission/src/handler.ts'),
    'utf8',
  );
  const auditPublisher = readFileSync(
    join(root, 'services/submission/src/audit-publisher.ts'),
    'utf8',
  );
  const spoolPublisher = readFileSync(
    join(root, 'services/submission/src/spool-update-publisher.ts'),
    'utf8',
  );

  assert.match(processor, /SpoolUpdateEnvelope/);
  assert.match(processor, /status_transition/);
  assert.match(handler, /SubmissionProcessor/);
  assert.match(auditPublisher, /sgp\.esocial\.audit/);
  assert.match(spoolPublisher, /sgp\.esocial\.spool\.update/);
  assert.doesNotMatch(
    processor + handler + auditPublisher + spoolPublisher,
    /DATABASE_URL|sgp_test|public\.esocial|backend\/src/i,
  );
});
