import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  PROMOTED_TABLE_EVENT_CLASSES,
  TABLE_EVENT_METADATA,
  TableBuilderValidationError,
  buildTableEvent,
} from '../../packages/domain/src/xml/builders/tables/index.ts';

const root = new URL('../..', import.meta.url).pathname;
const tenantId = '00000000-0000-0000-0000-000000000100';
const competence = '2026-01';

const tableDtos = {
  'S-1000': {
    eventClass: 'S-1000',
    tenantId,
    sourceEntityId: '00000000-0000-4000-8000-000000000001',
    competence,
    employer: {
      registrationNumber: '12345678000199',
    },
  },
  'S-1005': {
    eventClass: 'S-1005',
    tenantId,
    sourceEntityId: '00000000-0000-4000-8000-000000000005',
    competence,
    establishment: {
      registrationNumber: '12345678000199',
      employerRegistrationNumber: '12345678000199',
    },
  },
  'S-1010': {
    eventClass: 'S-1010',
    tenantId,
    sourceEntityId: '00000000-0000-4000-8000-000000000010',
    competence,
    rubric: {
      code: 'BASE',
      description: 'Rubrica base',
      natureCode: '1000',
      type: 'earning',
      incidences: {
        codIncPisPasep: '11',
      },
      employerRegistrationNumber: '12345678000199',
    },
  },
  'S-1020': {
    eventClass: 'S-1020',
    tenantId,
    sourceEntityId: '00000000-0000-4000-8000-000000000020',
    competence,
    taxLotation: {
      code: 'LOT01',
      employerRegistrationNumber: '12345678000199',
      fpasCode: '582',
    },
  },
  'S-1050': {
    eventClass: 'S-1050',
    tenantId,
    sourceEntityId: '00000000-0000-4000-8000-000000000050',
    competence,
    workSchedule: {
      code: 'JORN01',
      description: 'Jornada padrao',
      dailyHours: '8.00',
      employerRegistrationNumber: '12345678000199',
    },
  },
  'S-1070': {
    eventClass: 'S-1070',
    tenantId,
    sourceEntityId: '00000000-0000-4000-8000-000000000070',
    competence,
    process: {
      processNumber: '12345678901234567',
      subject: 'Processo administrativo',
      employerRegistrationNumber: '12345678000199',
    },
  },
};

const goldenFiles = {
  'S-1000': 's1000.golden.xml',
  'S-1005': 's1005.golden.xml',
  'S-1010': 's1010.golden.xml',
  'S-1020': 's1020.golden.xml',
  'S-1050': 's1050.golden.xml',
  'S-1070': 's1070.golden.xml',
};

const expectedReferences = {
  'S-1000': 'ID0574203510920611329752235002348238',
  'S-1005': 'ID9172027725231267344205267634002097',
  'S-1010': 'ID2676069438473635042210348443355443',
  'S-1020': 'ID3118733514322300281182914374950485',
  'S-1050': 'ID1267855552129432158227144100287037',
  'S-1070': 'ID0128165385130474018067327268345301',
};

const metadataExpectations = {
  'S-1000': {
    eventElement: 'evtInfoEmpregador',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00',
    xsdFile: 'evtInfoEmpregador.xsd',
    dependencies: [],
  },
  'S-1005': {
    eventElement: 'evtTabEstab',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtTabEstab/v_S_01_03_00',
    xsdFile: 'evtTabEstab.xsd',
    dependencies: ['S-1000'],
  },
  'S-1010': {
    eventElement: 'evtTabRubrica',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00',
    xsdFile: 'evtTabRubrica.xsd',
    dependencies: ['S-1000'],
  },
  'S-1020': {
    eventElement: 'evtTabLotacao',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtTabLotacao/v_S_01_03_00',
    xsdFile: 'evtTabLotacao.xsd',
    dependencies: ['S-1000'],
  },
  'S-1050': {
    eventElement: 'evtTabJornada',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtTabJornada/v_S_01_03_00',
    xsdFile: 'evtTabJornada.xsd',
    dependencies: ['S-1000'],
  },
  'S-1070': {
    eventElement: 'evtTabProcesso',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtTabProcesso/v_S_01_03_00',
    xsdFile: 'evtTabProcesso.xsd',
    dependencies: ['S-1000'],
  },
};

test('promoted table builders match committed golden XML bytes', () => {
  for (const eventClass of PROMOTED_TABLE_EVENT_CLASSES) {
    const built = buildTableEvent(tableDtos[eventClass]);
    assert.equal(built.xml, golden(goldenFiles[eventClass]), eventClass);
    assert.equal(built.reference, expectedReferences[eventClass]);
    assert.equal(built.eventId, expectedReferences[eventClass]);
    assert.equal(built.source.tenantId, tenantId);
    assert.equal(built.source.sourceEntityId, tableDtos[eventClass].sourceEntityId);
    assert.equal(built.operation, 'inclusao');
    assert.match(built.xmlSha256, /^[a-f0-9]{64}$/);
  }
});

test('promoted table metadata pins event code, leiaute, namespace, XSD, and dependencies', () => {
  for (const eventClass of PROMOTED_TABLE_EVENT_CLASSES) {
    const built = buildTableEvent(tableDtos[eventClass]);
    const metadata = TABLE_EVENT_METADATA[eventClass];
    const expectation = metadataExpectations[eventClass];

    assert.deepEqual(built.metadata, metadata);
    assert.equal(metadata.eventCode, eventClass);
    assert.equal(metadata.leiauteVersion, 'S-1.3');
    assert.equal(metadata.rootElement, 'eSocial');
    assert.equal(metadata.eventElement, expectation.eventElement);
    assert.equal(metadata.namespace, expectation.namespace);
    assert.equal(metadata.xsdPath.endsWith(`/${expectation.xsdFile}`), true);
    assert.deepEqual(
      [...metadata.tableVersionDependencies],
      expectation.dependencies,
    );
    assert.equal(existsSync(join(root, metadata.xsdPath)), true);
    assert.match(
      built.xml,
      new RegExp(`<eSocial xmlns="${escapeRegExp(metadata.namespace)}">`),
    );
    assert.match(
      built.xml,
      new RegExp(`<${metadata.eventElement} Id="${built.eventId}">`),
    );
  }
});

test('promoted table builders reject invalid DTOs before signing or submission', () => {
  assert.throws(
    () =>
      buildTableEvent({
        ...tableDtos['S-1000'],
        sourceEntityId: '',
      }),
    TableBuilderValidationError,
  );

  assert.throws(
    () =>
      buildTableEvent({
        ...tableDtos['S-1010'],
        rubric: {
          ...tableDtos['S-1010'].rubric,
          code: '',
        },
      }),
    /rubric\.code/,
  );

  assert.throws(
    () =>
      buildTableEvent({
        ...tableDtos['S-1050'],
        workSchedule: {
          ...tableDtos['S-1050'].workSchedule,
          dailyHours: 'not-a-number',
        },
      }),
    /dailyHours/,
  );
});

test('promoted table builder source has no SGP database or module coupling', () => {
  const source = readFileSync(
    join(root, 'packages/domain/src/xml/builders/tables/index.ts'),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"].*(hr|payroll|saude)\//);
  assert.doesNotMatch(source, /\b(hr|payroll|saude)\./);
  assert.doesNotMatch(source, /public\.esocial_event/);
  assert.doesNotMatch(source, /DatabaseService|QueryResultRow|@nestjs/);
});

function golden(fileName) {
  return readFileSync(
    join(root, 'docs/templates/golden/builders', fileName),
    'utf8',
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
