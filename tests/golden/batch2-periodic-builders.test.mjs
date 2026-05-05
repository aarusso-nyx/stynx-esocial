import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  MissingReceiptReference,
  buildS1202,
  buildS1207,
  buildS1210,
  buildS1298,
} from '../../packages/domain/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;

const specs = {
  'S-1202': {
    fixture: 's1202.dto.json',
    golden: 's1202-rpps-workers.golden.xml',
    build: buildS1202,
    eventElement: 'evtRmnRPPS',
    xsd: 'evtRmnRPPS.xsd',
    tableDependencies: ['S-1000', 'S-1005', 'S-1010'],
    receiptDependencies: [],
    eventIds: [
      'ID2019386940101126405023739215305542',
      'ID6344823724221135648345073453014503',
    ],
  },
  'S-1207': {
    fixture: 's1207.dto.json',
    golden: 's1207-rpps-benefit.golden.xml',
    build: buildS1207,
    eventElement: 'evtBenPrRP',
    xsd: 'evtBenPrRP.xsd',
    tableDependencies: ['S-1000', 'S-1010'],
    receiptDependencies: ['S-2410'],
    eventIds: ['ID0607764447991303425170125046256529'],
  },
  'S-1210': {
    fixture: 's1210.dto.json',
    golden: 's1210-confirmed-payments.golden.xml',
    build: buildS1210,
    eventElement: 'evtPgtos',
    xsd: 'evtPgtos.xsd',
    tableDependencies: ['S-1000'],
    receiptDependencies: ['S-1200', 'S-1202', 'S-1207'],
    eventIds: [
      'ID6530558008629594514112177766840098',
      'ID9546489517208322483090103582716127',
    ],
  },
  'S-1298': {
    fixture: 's1298.dto.json',
    golden: 's1298.golden.xml',
    build: buildS1298,
    eventElement: 'evtReabreEvPer',
    xsd: 'evtReabreEvPer.xsd',
    tableDependencies: ['S-1000'],
    receiptDependencies: ['S-1299'],
    eventIds: ['ID3052459586767019940862352939243325'],
  },
};

test('Batch 2 active periodic DTO builders match committed golden XML bytes', () => {
  for (const [eventClass, spec] of Object.entries(specs)) {
    const built = spec.build(fixture(spec.fixture));
    assert.equal(built.xml, golden(spec.golden), eventClass);
    assert.equal(built.metadata.eventCode, eventClass);
    assert.equal(built.metadata.xmlRoot, 'eSocial');
    assert.equal(built.metadata.eventElement, spec.eventElement);
    assert.equal(built.metadata.xsdBinding.endsWith(`/${spec.xsd}`), true);
    assert.deepEqual(
      [...built.metadata.tableVersionDependencies],
      spec.tableDependencies,
    );
    assert.deepEqual(
      [...(built.metadata.receiptDependencies ?? [])],
      spec.receiptDependencies,
    );
    assert.deepEqual([...built.eventIds], spec.eventIds);
    assert.match(built.xmlSha256, /^[a-f0-9]{64}$/u);
  }
});

test('Batch 2 active periodic builders reject source DTOs missing regulatory evidence', () => {
  assert.throws(
    () =>
      buildS1207({
        ...fixture('s1207.dto.json'),
        benefits: [
          {
            ...fixture('s1207.dto.json').benefits[0],
            benefitSourceId: '',
          },
        ],
      }),
    /benefitSourceId/u,
  );

  assert.throws(
    () =>
      buildS1210({
        ...fixture('s1210.dto.json'),
        payments: [
          {
            ...fixture('s1210.dto.json').payments[0],
            receiptReference: '',
          },
        ],
      }),
    MissingReceiptReference,
  );

  assert.throws(
    () =>
      buildS1298({
        ...fixture('s1298.dto.json'),
        acceptedClosureReceipt: '',
      }),
    /acceptedClosureReceipt/u,
  );
});

function fixture(fileName) {
  return JSON.parse(readFileSync(join(root, 'tests/golden/fixtures', fileName), 'utf8'));
}

function golden(fileName) {
  return readFileSync(join(root, 'docs/templates/golden/builders', fileName), 'utf8');
}
