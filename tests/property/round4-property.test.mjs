import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import fc from 'fast-check';

import {
  buildEsocialIdempotencyKey,
  ESOCIAL_ENVIRONMENTS,
  ESOCIAL_RELAY_EVENT_CLASSES,
} from '../../packages/contracts/dist/index.js';
import {
  buildS1299,
  classifyRetryFailure,
  decideRetry,
  parseTotalizerXml,
} from '../../packages/domain/dist/index.js';
import { redactForLog } from '../../packages/domain/dist/observability/redaction.js';

const root = new URL('../..', import.meta.url).pathname;
const propertyOptions = {
  numRuns: Number(process.env.ESOCIAL_PROPERTY_RUNS ?? 50),
  seed: Number(process.env.ESOCIAL_PROPERTY_SEED ?? 20260506),
};

test('idempotency-key construction is deterministic and source-id list order independent', () => {
  fc.assert(
    fc.property(
      fc.uuid(),
      fc.constantFrom(...ESOCIAL_ENVIRONMENTS),
      fc.constantFrom(...ESOCIAL_RELAY_EVENT_CLASSES.filter((eventClass) => !eventClass.startsWith('S-50'))),
      fc.array(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 0, maxLength: 5 }),
      fc.string({ minLength: 1, maxLength: 20 }),
      (tenantId, environment, eventClass, sourceEntityIds, sourceEventId) => {
        const input = {
          family: 'request',
          tenant_id: tenantId,
          environment,
          event_class: eventClass,
          source_event_id: sourceEventId,
          source_entity_ids: sourceEntityIds,
          competence: '2026-05',
          payload_hash: sha256(`${tenantId}:${eventClass}:${sourceEventId}`),
        };
        const left = buildEsocialIdempotencyKey(input);
        const right = buildEsocialIdempotencyKey({
          ...input,
          source_entity_ids: [...sourceEntityIds].reverse(),
        });

        assert.equal(left.value, right.value);
        assert.equal(left.value, buildEsocialIdempotencyKey(input).value);
      },
    ),
    propertyOptions,
  );
});

test('S-1299 builder preserves XML invariants for generated accepted-count inputs', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
      (remuneration, payments) => {
        const built = buildS1299({
          tenantId: '00000000-0000-4000-8000-000000000101',
          sourceEventId: '10000000-0000-4000-8000-000000000001',
          sourceEntityId: 'payroll-run-2026-05',
          environment: 'qualification',
          eventClass: 'S-1299',
          employerCnpj: '12345678000195',
          competence: '2026-05',
          payrollRunId: 'payroll-run-2026-05',
          pendingPeriodicEvents: [],
          acceptedEventCounts: { remuneration, payments },
        });

        assert.equal(built.metadata.eventCode, 'S-1299');
        assert.match(built.xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/u);
        assert.match(built.xml, /<evtFechaEvPer Id="ID[0-9]+">/u);
        assert.match(built.xml, new RegExp(`<evtRemun>${remuneration > 0 ? 'S' : 'N'}</evtRemun>`, 'u'));
        assert.match(built.xml, new RegExp(`<evtPgtos>${payments > 0 ? 'S' : 'N'}</evtPgtos>`, 'u'));
      },
    ),
    propertyOptions,
  );
});

test('S-50xx totalizer fixtures round-trip to the expected classifications', () => {
  for (const [file, expectedKind] of [
    ['s5001-totalizer.golden.xml', 'S-5001'],
    ['s5002-totalizer.golden.xml', 'S-5002'],
    ['s5011-totalizer.golden.xml', 'S-5011'],
    ['s5012-totalizer.golden.xml', 'S-5012'],
    ['s5013-totalizer.golden.xml', 'S-5013'],
  ]) {
    const parsed = parseTotalizerXml(
      readFileSync(join(root, 'docs/templates/golden/returns', file), 'utf8'),
    );
    assert.equal(parsed.kind, expectedKind);
    assert.equal(parsed.sourceEventReceipt.length > 0, true);
  }
});

test('retry classification and decisions are stable for identical generated errors', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('transport', 'timeout', 'validation', 'schema', 'authentication', 'internal'),
      fc.integer({ min: 0, max: 5 }),
      (category, attempt) => {
        const error = {
          code: `ERR_${category.toUpperCase()}`,
          category,
          message: `${category} failure`,
          retryable: category === 'transport' || category === 'timeout',
        };
        const input = {
          attempt,
          occurredAt: new Date('2026-05-06T13:00:00.000Z'),
          error,
          jitterSeed: `${category}:${attempt}`,
        };

        assert.equal(classifyRetryFailure(error), classifyRetryFailure(error));
        assert.deepEqual(decideRetry(input), decideRetry(input));
      },
    ),
    propertyOptions,
  );
});

test('redaction never emits generated CPF or CNPJ values verbatim', () => {
  fc.assert(
    fc.property(
      fc.tuple(...Array.from({ length: 11 }, () => fc.integer({ min: 0, max: 9 }))),
      fc.tuple(...Array.from({ length: 14 }, () => fc.integer({ min: 0, max: 9 }))),
      (cpfDigits, cnpjDigits) => {
        const cpf = cpfDigits.join('');
        const cnpj = cnpjDigits.join('');
        const redacted = JSON.stringify(redactForLog({
          cpf,
          cnpj,
          nested: [`cpf=${cpf}`, `cnpj=${cnpj}`],
        }));

        assert.equal(redacted.includes(cpf), false);
        assert.equal(redacted.includes(cnpj), false);
      },
    ),
    propertyOptions,
  );
});

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
