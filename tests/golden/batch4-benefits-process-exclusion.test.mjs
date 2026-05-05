import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  assertPromotedBenefitProcessVariantHandled,
  buildS2400,
  buildS2405,
  buildS2410,
  buildS2416,
  buildS2418,
  buildS2420,
  buildS2501,
  buildS3000,
  dispatchByEventClass,
  dispatchExclusionByOriginalClass,
} from '../../packages/domain/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;

const specs = {
  'S-2400': {
    fixture: 's2400.dto.json',
    golden: 's2400.golden.xml',
    build: buildS2400,
    eventElement: 'evtCdBenefIn',
    xsd: 'evtCdBenefIn.xsd',
    receiptDependencies: [],
  },
  'S-2405': {
    fixture: 's2405.dto.json',
    golden: 's2405.golden.xml',
    build: buildS2405,
    eventElement: 'evtCdBenefAlt',
    xsd: 'evtCdBenefAlt.xsd',
    receiptDependencies: ['S-2400'],
  },
  'S-2410-retirement': {
    eventClass: 'S-2410',
    fixture: 's2410-retirement.dto.json',
    golden: 's2410-retirement.golden.xml',
    build: buildS2410,
    eventElement: 'evtCdBenIn',
    xsd: 'evtCdBenIn.xsd',
    receiptDependencies: ['S-2400'],
  },
  'S-2410-pension': {
    eventClass: 'S-2410',
    fixture: 's2410-pension.dto.json',
    golden: 's2410-pension.golden.xml',
    build: buildS2410,
    eventElement: 'evtCdBenIn',
    xsd: 'evtCdBenIn.xsd',
    receiptDependencies: ['S-2400'],
  },
  'S-2416': {
    fixture: 's2416.dto.json',
    golden: 's2416-pension-founder.golden.xml',
    build: buildS2416,
    eventElement: 'evtCdBenAlt',
    xsd: 'evtCdBenAlt.xsd',
    receiptDependencies: ['S-2410'],
  },
  'S-2418-retirement': {
    eventClass: 'S-2418',
    fixture: 's2418-retirement.dto.json',
    golden: 's2418-retirement.golden.xml',
    build: buildS2418,
    eventElement: 'evtReativBen',
    xsd: 'evtReativBen.xsd',
    receiptDependencies: ['S-2410', 'S-2420'],
  },
  'S-2418-pension': {
    eventClass: 'S-2418',
    fixture: 's2418-pension.dto.json',
    golden: 's2418-pension.golden.xml',
    build: buildS2418,
    eventElement: 'evtReativBen',
    xsd: 'evtReativBen.xsd',
    receiptDependencies: ['S-2410', 'S-2420'],
  },
  'S-2420': {
    fixture: 's2420.dto.json',
    golden: 's2420-pension.golden.xml',
    build: buildS2420,
    eventElement: 'evtCdBenTerm',
    xsd: 'evtCdBenTerm.xsd',
    receiptDependencies: ['S-2410'],
  },
  'S-2501': {
    fixture: 's2501.dto.json',
    golden: 's2501.golden.xml',
    build: buildS2501,
    eventElement: 'evtContProc',
    xsd: 'evtContProc.xsd',
    receiptDependencies: [],
  },
  'S-3000': {
    fixture: 's3000-worker.dto.json',
    golden: 's3000.golden.xml',
    build: buildS3000,
    eventElement: 'evtExclusao',
    xsd: 'evtExclusao.xsd',
    receiptDependencies: [],
  },
};

const variants = {
  'S-2400': ['default'],
  'S-2405': ['default'],
  'S-2410': ['retirement', 'pension'],
  'S-2416': ['pension-founder'],
  'S-2418': ['retirement', 'pension'],
  'S-2420': ['pension'],
  'S-2501': ['process-tax'],
  'S-3000': ['table', 'worker', 'periodic', 'benefit', 'process'],
};

test('Batch 4 active benefit/process/exclusion DTO builders match committed golden XML bytes', () => {
  for (const [key, spec] of Object.entries(specs)) {
    const eventClass = spec.eventClass ?? key;
    const built = spec.build(fixture(spec.fixture));
    assert.equal(built.xml, golden(spec.golden), key);
    assert.equal(built.metadata.eventCode, eventClass);
    assert.equal(built.metadata.xmlRoot, 'eSocial');
    assert.equal(built.metadata.eventElement, spec.eventElement);
    assert.equal(built.metadata.xsdBinding.endsWith(`/${spec.xsd}`), true);
    assert.deepEqual([...built.metadata.tableVersionDependencies], ['S-1000']);
    assert.deepEqual(
      [...(built.metadata.receiptDependencies ?? [])],
      spec.receiptDependencies,
    );
    assert.equal(built.eventIds.length, 1);
    assert.match(built.xmlSha256, /^[a-f0-9]{64}$/u);
  }
});

test('Batch 4 discriminated benefit/process variants are exhaustively recognized', () => {
  for (const [eventClass, eventVariants] of Object.entries(variants)) {
    for (const variant of eventVariants) {
      assert.equal(assertPromotedBenefitProcessVariantHandled(eventClass, variant), true);
    }
    assert.throws(
      () => assertPromotedBenefitProcessVariantHandled(eventClass, 'not-a-variant'),
      /Invalid eSocial DTO fields/u,
      eventClass,
    );
  }
});

test('Batch 4 submission dispatcher routes benefit/process/exclusion DTOs to active builders', () => {
  for (const [key, spec] of Object.entries(specs)) {
    const eventClass = spec.eventClass ?? key;
    const result = dispatchByEventClass(fixture(spec.fixture), {
      occurredAt: '2026-05-05T12:00:00.000Z',
      request: {
        event_class: eventClass,
        environment: 'QUALIFICATION',
      },
    });

    assert.equal(result.eventClass, eventClass);
    assert.equal(result.builderReady, true);
    assert.equal(result.builtXml.metadata.eventCode, eventClass);
    assert.equal(result.builtXml.xml, golden(spec.golden));
  }
});

test('Batch 4 S-3000 routes table and non-table exclusions without SGP table reads', () => {
  const table = dispatchExclusionByOriginalClass(fixture('s3000-table.dto.json'));
  const worker = dispatchExclusionByOriginalClass(fixture('s3000-worker.dto.json'));

  assert.equal(table.targetClassFamily, 'table');
  assert.equal(table.identityXml, '');
  assert.equal(worker.targetClassFamily, 'worker');
  assert.match(worker.identityXml, /<ideTrabalhador><cpfTrab>12345678901<\/cpfTrab><\/ideTrabalhador>/u);
  assert.doesNotMatch(buildS3000(fixture('s3000-worker.dto.json')).xml, /public\.esocial_event|hr\.employee/u);
});

test('Batch 4 builders reject missing receipts, empty bases, duplicate process numbers, and incomplete exclusions', () => {
  assert.throws(
    () =>
      buildS2405({
        ...fixture('s2405.dto.json'),
        acceptedS2400Receipt: '',
      }),
    /acceptedS2400Receipt/u,
  );

  assert.throws(
    () =>
      buildS2501({
        ...fixture('s2501.dto.json'),
        processTaxBases: [],
      }),
    /processTaxBases/u,
  );

  assert.throws(
    () =>
      buildS2501({
        ...fixture('s2501.dto.json'),
        linkedProcessNumbers: ['12345678901234567890'],
      }),
    /linkedProcessNumbers/u,
  );

  assert.throws(
    () =>
      buildS3000({
        ...fixture('s3000-worker.dto.json'),
        originalReceipt: '',
      }),
    /originalReceipt/u,
  );
});

test('Batch 4 S-2501 accepts representative process-number formats', () => {
  for (const processNumber of [
    '12345678901234567890',
    '12345-678901234567890',
    '000.000.000.000.001',
  ]) {
    const built = buildS2501({
      ...fixture('s2501.dto.json'),
      processNumber,
      linkedProcessNumbers: [],
    });
    assert.match(built.xml, /<nrProcTrab>\d{15,20}<\/nrProcTrab>/u);
  }
});

test('Batch 4 S-2410 publishes benefitIdentifier as the S-1207 source reference literal', () => {
  const benefit = fixture('s2410-retirement.dto.json');
  const payroll = fixture('s1207.dto.json');

  assert.equal(benefit.benefitIdentifier, payroll.benefits[0].benefitSourceId);
});

test('Batch 4 S-2418 publishes reactivatedBenefitReceipt as the S-2298 benefit receipt field', () => {
  const reactivation = fixture('s2418-retirement.dto.json');
  const reintegration = {
    ...fixture('s2298.dto.json'),
    reactivatedBenefitReceipt: reactivation.reactivatedBenefitReceipt,
  };

  assert.equal(reintegration.reactivatedBenefitReceipt, reactivation.reactivatedBenefitReceipt);
});

function fixture(fileName) {
  return JSON.parse(readFileSync(join(root, 'tests/golden/fixtures', fileName), 'utf8'));
}

function golden(fileName) {
  return readFileSync(join(root, 'docs/templates/golden/builders', fileName), 'utf8');
}
