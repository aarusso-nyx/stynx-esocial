import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildS1005,
  buildS1020,
  buildS1050,
  buildS1070,
} from '../../packages/domain/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;

const specs = {
  'S-1005': {
    fixture: 's1005.dto.json',
    golden: 's1005.golden.xml',
    build: buildS1005,
    eventElement: 'evtTabEstab',
    xsd: 'evtTabEstab.xsd',
    dependencies: ['S-1000'],
  },
  'S-1020': {
    fixture: 's1020.dto.json',
    golden: 's1020.golden.xml',
    build: buildS1020,
    eventElement: 'evtTabLotacao',
    xsd: 'evtTabLotacao.xsd',
    dependencies: ['S-1000'],
  },
  'S-1050': {
    fixture: 's1050.dto.json',
    golden: 's1050.golden.xml',
    build: buildS1050,
    eventElement: 'evtTabJornada',
    xsd: 'evtTabJornada.xsd',
    dependencies: ['S-1000'],
  },
  'S-1070': {
    fixture: 's1070.dto.json',
    golden: 's1070.golden.xml',
    build: buildS1070,
    eventElement: 'evtTabProcesso',
    xsd: 'evtTabProcesso.xsd',
    dependencies: ['S-1000'],
  },
};

test('Batch 1 promoted table DTO builders match committed golden XML bytes', () => {
  for (const [eventClass, spec] of Object.entries(specs)) {
    const built = spec.build(fixture(spec.fixture));
    assert.equal(built.xml, golden(spec.golden), eventClass);
    assert.equal(built.metadata.eventCode, eventClass);
    assert.equal(built.metadata.xmlRoot, 'eSocial');
    assert.equal(built.metadata.eventElement, spec.eventElement);
    assert.equal(built.metadata.xsdBinding.endsWith(`/${spec.xsd}`), true);
    assert.deepEqual([...built.metadata.tableVersionDependencies], spec.dependencies);
    assert.equal(built.eventIds.length, 1);
    assert.match(built.xmlSha256, /^[a-f0-9]{64}$/u);
  }
});

test('Batch 1 promoted table DTO builders reject missing required source fields', () => {
  assert.throws(
    () => buildS1005({ ...fixture('s1005.dto.json'), establishmentRegistrationNumber: '' }),
    /Invalid eSocial DTO fields/u,
  );
  assert.throws(
    () => buildS1020({ ...fixture('s1020.dto.json'), lotationCode: '' }),
    /Invalid eSocial DTO fields/u,
  );
  assert.throws(
    () => buildS1050({ ...fixture('s1050.dto.json'), dailyHours: '' }),
    /Invalid eSocial DTO fields/u,
  );
  assert.throws(
    () => buildS1070({ ...fixture('s1070.dto.json'), processNumber: '' }),
    /Invalid eSocial DTO fields/u,
  );
});

function fixture(fileName) {
  return JSON.parse(readFileSync(join(root, 'tests/golden/fixtures', fileName), 'utf8'));
}

function golden(fileName) {
  return readFileSync(join(root, 'docs/templates/golden/builders', fileName), 'utf8');
}
