import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  assertPromotedWorkerVariantHandled,
  buildS2205,
  buildS2206,
  buildS2210,
  buildS2220,
  buildS2230,
  buildS2240,
  buildS2298Worker,
  buildS2299Worker,
  buildS2300,
  buildS2306,
  buildS2399,
  dispatchByEventClass,
} from '../../packages/domain/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;

const specs = {
  'S-2205': {
    fixture: 's2205.dto.json',
    golden: 's2205.golden.xml',
    build: buildS2205,
    eventElement: 'evtAltCadastral',
    xsd: 'evtAltCadastral.xsd',
    receiptDependencies: ['S-2200'],
  },
  'S-2206': {
    fixture: 's2206.dto.json',
    golden: 's2206-promotion.golden.xml',
    build: buildS2206,
    eventElement: 'evtAltContratual',
    xsd: 'evtAltContratual.xsd',
    receiptDependencies: ['S-2200'],
  },
  'S-2210': {
    fixture: 's2210.dto.json',
    golden: 's2210-inicial.golden.xml',
    build: buildS2210,
    eventElement: 'evtCAT',
    xsd: 'evtCAT.xsd',
    receiptDependencies: ['S-2200'],
  },
  'S-2220': {
    fixture: 's2220.dto.json',
    golden: 's2220-periodico.golden.xml',
    build: buildS2220,
    eventElement: 'evtMonit',
    xsd: 'evtMonit.xsd',
    receiptDependencies: ['S-2200'],
  },
  'S-2230': {
    fixture: 's2230.dto.json',
    golden: 's2230-medical-leave.golden.xml',
    build: buildS2230,
    eventElement: 'evtAfastTemp',
    xsd: 'evtAfastTemp.xsd',
    receiptDependencies: ['S-2200'],
  },
  'S-2240': {
    fixture: 's2240.dto.json',
    golden: 's2240-noise-start.golden.xml',
    build: buildS2240,
    eventElement: 'evtExpRisco',
    xsd: 'evtExpRisco.xsd',
    receiptDependencies: ['S-2200'],
  },
  'S-2298': {
    fixture: 's2298.dto.json',
    golden: 's2298.golden.xml',
    build: buildS2298Worker,
    eventElement: 'evtReintegr',
    xsd: 'evtReintegr.xsd',
    receiptDependencies: ['S-2299'],
  },
  'S-2299': {
    fixture: 's2299.dto.json',
    golden: 's2299-with-notice.golden.xml',
    build: buildS2299Worker,
    eventElement: 'evtDeslig',
    xsd: 'evtDeslig.xsd',
    receiptDependencies: ['S-2200'],
  },
  'S-2300': {
    fixture: 's2300.dto.json',
    golden: 's2300-estagiario.golden.xml',
    build: buildS2300,
    eventElement: 'evtTSVInicio',
    xsd: 'evtTSVInicio.xsd',
    receiptDependencies: ['S-2200'],
  },
  'S-2306': {
    fixture: 's2306.dto.json',
    golden: 's2306.golden.xml',
    build: buildS2306,
    eventElement: 'evtTSVAltContr',
    xsd: 'evtTSVAltContr.xsd',
    receiptDependencies: ['S-2300'],
  },
  'S-2399': {
    fixture: 's2399.dto.json',
    golden: 's2399-estagiario.golden.xml',
    build: buildS2399,
    eventElement: 'evtTSVTermino',
    xsd: 'evtTSVTermino.xsd',
    receiptDependencies: ['S-2300', 'S-2306'],
  },
};

const variants = {
  'S-2205': ['default'],
  'S-2206': ['promotion', 'transfer', 'regime-change'],
  'S-2210': ['initial', 'death', 'reopening'],
  'S-2220': ['admission', 'periodic', 'return-to-work', 'termination'],
  'S-2230': ['medical-leave', 'vacation'],
  'S-2240': ['start', 'change', 'end'],
  'S-2298': ['judicial', 'amnesty', 'other'],
  'S-2299': ['with-notice', 'without-notice'],
  'S-2300': ['intern', 'autonomous', 'council-member'],
  'S-2306': ['role', 'pay', 'internship', 'workplace'],
  'S-2399': ['intern', 'autonomous', 'council-member'],
};

test('Batch 3 active worker/SST/TSV DTO builders match committed golden XML bytes', () => {
  for (const [eventClass, spec] of Object.entries(specs)) {
    const built = spec.build(fixture(spec.fixture));
    assert.equal(built.xml, golden(spec.golden), eventClass);
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

test('Batch 3 discriminated worker variants are exhaustively recognized', () => {
  for (const [eventClass, eventVariants] of Object.entries(variants)) {
    for (const variant of eventVariants) {
      assert.equal(assertPromotedWorkerVariantHandled(eventClass, variant), true);
    }
    assert.throws(
      () => assertPromotedWorkerVariantHandled(eventClass, 'not-a-variant'),
      /Invalid eSocial DTO fields/u,
      eventClass,
    );
  }
});

test('Batch 3 submission dispatcher routes worker DTOs to active builders', () => {
  for (const [eventClass, spec] of Object.entries(specs)) {
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

test('Batch 3 worker builders reject missing receipt context and required arrays', () => {
  assert.throws(
    () =>
      buildS2210({
        ...fixture('s2210.dto.json'),
        kind: 'reopening',
        originalReceipt: '',
      }),
    /originalReceipt/u,
  );

  assert.throws(
    () =>
      buildS2298Worker({
        ...fixture('s2298.dto.json'),
        originalS2299Receipt: '',
      }),
    /originalS2299Receipt/u,
  );

  assert.throws(
    () =>
      buildS2399({
        ...fixture('s2399.dto.json'),
        acceptedS2300Receipt: '',
      }),
    /acceptedS2300Receipt/u,
  );
});

function fixture(fileName) {
  return JSON.parse(readFileSync(join(root, 'tests/golden/fixtures', fileName), 'utf8'));
}

function golden(fileName) {
  return readFileSync(join(root, 'docs/templates/golden/builders', fileName), 'utf8');
}
