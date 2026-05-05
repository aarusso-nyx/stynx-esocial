import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  DtoValidationError,
  S1000_METADATA,
  S1010_METADATA,
  S1200_METADATA,
  S1299_METADATA,
  S2200_METADATA,
  buildS1000,
  buildS1010,
  buildS1200,
  buildS1299,
  buildS2200,
} from '../../packages/domain/dist/builders/index.js';

const root = new URL('../..', import.meta.url).pathname;

const families = {
  'S-1000': {
    fixture: 's1000.dto.json',
    golden: 's1000.golden.xml',
    build: buildS1000,
    metadata: S1000_METADATA,
    eventIds: ['ID0574203510920611329752235002348238'],
    invalid: (dto) => ({ ...dto, employerCnpj: '' }),
    invalidField: 'employerCnpj',
  },
  'S-1010': {
    fixture: 's1010.dto.json',
    golden: 's1010.golden.xml',
    build: buildS1010,
    metadata: S1010_METADATA,
    eventIds: ['ID2676069438473635042210348443355443'],
    invalid: (dto) => ({ ...dto, rubricCode: '' }),
    invalidField: 'rubricCode',
  },
  'S-1200': {
    fixture: 's1200.dto.json',
    golden: 's1200-three-workers.golden.xml',
    build: buildS1200,
    metadata: S1200_METADATA,
    eventIds: [
      'ID6147722505041620020405535998422816',
      'ID6292253274521902824885081625504515',
      'ID1314444009744040730017118855632514',
    ],
    invalid: (dto) => ({ ...dto, payrollRunStatus: 'APPROVED' }),
    invalidField: 'payrollRunStatus',
  },
  'S-1299': {
    fixture: 's1299.dto.json',
    golden: 's1299.golden.xml',
    build: buildS1299,
    metadata: S1299_METADATA,
    eventIds: ['ID3409944475143212543041043634453544'],
    invalid: (dto) => ({ ...dto, pendingPeriodicEvents: ['S-1200'] }),
    invalidField: 'pendingPeriodicEvents',
  },
  'S-2200': {
    fixture: 's2200.dto.json',
    golden: 's2200.golden.xml',
    build: buildS2200,
    metadata: S2200_METADATA,
    eventIds: ['ID1806244455305431578605184074623499'],
    invalid: (dto) => ({ ...dto, cpf: '' }),
    invalidField: 'cpf',
  },
};

const metadataExpectations = {
  'S-1000': {
    eventElement: 'evtInfoEmpregador',
    xsdFile: 'evtInfoEmpregador.xsd',
    tableVersionDependencies: [],
  },
  'S-1010': {
    eventElement: 'evtTabRubrica',
    xsdFile: 'evtTabRubrica.xsd',
    tableVersionDependencies: ['S-1000'],
  },
  'S-1200': {
    eventElement: 'evtRemun',
    xsdFile: 'evtRemun.xsd',
    tableVersionDependencies: ['S-1000', 'S-1005', 'S-1010', 'S-1020'],
  },
  'S-1299': {
    eventElement: 'evtFechaEvPer',
    xsdFile: 'evtFechaEvPer.xsd',
    tableVersionDependencies: ['S-1000'],
    receiptDependencies: ['S-1200', 'S-1202', 'S-1207', 'S-1210'],
  },
  'S-2200': {
    eventElement: 'evtAdmissao',
    xsdFile: 'evtAdmissao.xsd',
    tableVersionDependencies: ['S-1000', 'S-1030', 'S-1050'],
  },
};

test('round-0 active builders match committed golden XML bytes from DTO fixtures', () => {
  for (const [eventClass, spec] of Object.entries(families)) {
    const built = spec.build(fixture(spec.fixture));
    assert.equal(built.xml, golden(spec.golden), eventClass);
    assert.deepEqual(built.eventIds, spec.eventIds, eventClass);
    assert.match(built.xmlSha256, /^[a-f0-9]{64}$/);
  }
});

test('round-0 active builder metadata pins leiaute, root, XSD, and dependencies', () => {
  for (const [eventClass, spec] of Object.entries(families)) {
    const expected = metadataExpectations[eventClass];
    assert.equal(spec.metadata.eventCode, eventClass);
    assert.equal(spec.metadata.leiauteVersion, 'S-1.3');
    assert.equal(spec.metadata.xmlRoot, 'eSocial');
    assert.equal(spec.metadata.eventElement, expected.eventElement);
    assert.equal(spec.metadata.xsdBinding.endsWith(`/${expected.xsdFile}`), true);
    assert.equal(existsSync(join(root, spec.metadata.xsdBinding)), true);
    assert.deepEqual(
      [...spec.metadata.tableVersionDependencies],
      expected.tableVersionDependencies,
    );
    assert.deepEqual(
      [...(spec.metadata.receiptDependencies ?? [])],
      expected.receiptDependencies ?? [],
    );
  }
});

test('round-0 active builders throw typed DTO validation errors with field paths', () => {
  for (const spec of Object.values(families)) {
    assert.throws(
      () => spec.build(spec.invalid(fixture(spec.fixture))),
      (error) =>
        error instanceof DtoValidationError &&
        error.fieldPaths.includes(spec.invalidField),
    );
  }
});

test('round-0 active builder source has no SGP database or module coupling', () => {
  for (const file of [
    'packages/domain/src/builders/common.ts',
    'packages/domain/src/builders/s1000/builder.ts',
    'packages/domain/src/builders/s1010/builder.ts',
    'packages/domain/src/builders/s1200/builder.ts',
    'packages/domain/src/builders/s1299/builder.ts',
    'packages/domain/src/builders/s2200/builder.ts',
  ]) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(source, /from ['"].*(hr|payroll|saude)\//);
    assert.doesNotMatch(source, /\b(hr|payroll|saude)\./);
    assert.doesNotMatch(source, /public\.esocial_event/);
    assert.doesNotMatch(source, /DatabaseService|QueryResultRow|@nestjs/);
  }
});

function fixture(fileName) {
  return JSON.parse(
    readFileSync(join(root, 'tests/golden/fixtures', fileName), 'utf8'),
  );
}

function golden(fileName) {
  return readFileSync(
    join(root, 'docs/templates/golden/builders', fileName),
    'utf8',
  );
}
