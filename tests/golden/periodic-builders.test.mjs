import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  PERIODIC_EVENT_METADATA,
  PROMOTED_PERIODIC_EVENT_CLASSES,
  PeriodicBuilderValidationError,
  buildPeriodicEvent,
} from '../../packages/domain/src/xml/builders/periodic/index.ts';

const root = new URL('../..', import.meta.url).pathname;
const employerRegistrationNumber = '12345678000199';

const periodicDtos = {
  'S-1200': {
    eventClass: 'S-1200',
    tenantId: '00000000-0000-0000-0000-000000000100',
    competence: '2026-01',
    employerRegistrationNumber,
    payrollRunId: '00000000-0000-4000-8000-000000001200',
    payrollRunStatus: 'GENERATED',
    workers: [
      workerRemuneration(
        '00000000-0000-4000-8000-000000000001',
        'MAT-001',
        '11122233344',
        '101',
        [
          rubric('BASIC', 'EARNING', '3000.00'),
          rubric('RPPS', 'DEDUCTION', '330.00'),
        ],
      ),
      workerRemuneration(
        '00000000-0000-4000-8000-000000000002',
        'MAT-002',
        '22233344405',
        '101',
        [
          rubric('BASIC', 'EARNING', '4200.00'),
          rubric('IRRF', 'DEDUCTION', '245.50'),
        ],
      ),
      workerRemuneration(
        '00000000-0000-4000-8000-000000000003',
        'MAT-003',
        '33344455506',
        '101',
        [
          rubric('AUX', 'INFORMATION', '800.00'),
          rubric('BASIC', 'EARNING', '2800.00'),
        ],
      ),
    ],
  },
  'S-1202': {
    eventClass: 'S-1202',
    tenantId: '00000000-0000-0000-0000-000000000120',
    competence: '2026-01',
    employerRegistrationNumber,
    payrollRunId: '00000000-0000-4000-8000-000000001202',
    payrollRunStatus: 'GENERATED',
    workers: [
      workerRemuneration(
        '00000000-0000-4000-8000-000000000301',
        'RPPS-001',
        '11122233344',
        '301',
        [
          rubric('BASIC', 'EARNING', '5000.00'),
          rubric('RPPS', 'DEDUCTION', '700.00'),
          rubric('IRRF', 'DEDUCTION', '350.00'),
        ],
      ),
      workerRemuneration(
        '00000000-0000-4000-8000-000000000302',
        'RPPS-002',
        '22233344405',
        '302',
        [
          rubric('BASIC', 'EARNING', '3200.00'),
          rubric('RPPS', 'DEDUCTION', '448.00'),
        ],
      ),
    ],
  },
  'S-1207': {
    eventClass: 'S-1207',
    tenantId: '00000000-0000-0000-0000-000000001207',
    competence: '2026-05',
    employerRegistrationNumber,
    payrollRunId: '00000000-0000-4000-8000-000000001207',
    payrollRunStatus: 'GENERATED',
    benefits: [
      {
        employeeId: '00000000-0000-4000-8000-000000001201',
        beneficiaryCpf: '11144477735',
        benefitSourceKind: 'RETIREMENT',
        benefitSourceId: '00000000-0000-4000-8000-000000002413',
        benefitNumber: 'RET08000000000002413',
        activeBenefitCount: 1,
        rubrics: [
          rubric('PROV', 'EARNING', '5200.00'),
          rubric('RPPS', 'DEDUCTION', '572.00'),
        ],
      },
    ],
  },
  'S-1210': {
    eventClass: 'S-1210',
    tenantId: '00000000-0000-0000-0000-000000000100',
    competence: '2026-01',
    employerRegistrationNumber,
    paymentBatchId: '00000000-0000-4000-8000-000000001210',
    paymentBatchStatus: 'PAID',
    payrollRunId: '00000000-0000-4000-8000-000000001200',
    confirmedTotal: '3000.00',
    payments: [
      payment(
        '00000000-0000-4000-8000-000000000001',
        '11122233344',
        '1000.00',
      ),
      payment(
        '00000000-0000-4000-8000-000000000002',
        '22233344405',
        '2000.00',
      ),
    ],
  },
  'S-1298': {
    eventClass: 'S-1298',
    tenantId: '00000000-0000-0000-0000-000000001298',
    competence: '2026-01',
    employerRegistrationNumber,
    acceptedClosureReceipt: '1.1.0000000000000001299',
    acceptedClosureAt: '2026-05-02T12:30:00.000Z',
  },
  'S-1299': {
    eventClass: 'S-1299',
    tenantId: '00000000-0000-0000-0000-000000001299',
    competence: '2026-01',
    employerRegistrationNumber,
    pendingPeriodicEvents: [],
    acceptedEventCounts: {
      remuneration: '2',
      payments: '2',
    },
  },
};

const goldenFiles = {
  'S-1200': 's1200-three-workers.golden.xml',
  'S-1202': 's1202-rpps-workers.golden.xml',
  'S-1207': 's1207-rpps-benefit.golden.xml',
  'S-1210': 's1210-confirmed-payments.golden.xml',
  'S-1298': 's1298.golden.xml',
  'S-1299': 's1299.golden.xml',
};

const expectedReferences = {
  'S-1200': [
    'ID6147722505041620020405535998422816',
    'ID6292253274521902824885081625504515',
    'ID1314444009744040730017118855632514',
  ],
  'S-1202': [
    'ID2019386940101126405023739215305542',
    'ID6344823724221135648345073453014503',
  ],
  'S-1207': ['ID0607764447991303425170125046256529'],
  'S-1210': [
    'ID6530558008629594514112177766840098',
    'ID9546489517208322483090103582716127',
  ],
  'S-1298': ['ID3052459586767019940862352939243325'],
  'S-1299': ['ID3409944475143212543041043634453544'],
};

const metadataExpectations = {
  'S-1200': {
    eventElement: 'evtRemun',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00',
    xsdFile: 'evtRemun.xsd',
    tableDependencies: ['S-1000', 'S-1005', 'S-1010', 'S-1020'],
    receiptDependencies: [],
  },
  'S-1202': {
    eventElement: 'evtRmnRPPS',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtRmnRPPS/v_S_01_03_00',
    xsdFile: 'evtRmnRPPS.xsd',
    tableDependencies: ['S-1000', 'S-1005', 'S-1010'],
    receiptDependencies: [],
  },
  'S-1207': {
    eventElement: 'evtBenPrRP',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtBenPrRP/v_S_01_03_00',
    xsdFile: 'evtBenPrRP.xsd',
    tableDependencies: ['S-1000', 'S-1010'],
    receiptDependencies: ['S-2410'],
  },
  'S-1210': {
    eventElement: 'evtPgtos',
    namespace: 'http://www.esocial.gov.br/schema/evt/evtPgtos/v_S_01_03_00',
    xsdFile: 'evtPgtos.xsd',
    tableDependencies: ['S-1000'],
    receiptDependencies: ['S-1200', 'S-1202', 'S-1207'],
  },
  'S-1298': {
    eventElement: 'evtReabreEvPer',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtReabreEvPer/v_S_01_03_00',
    xsdFile: 'evtReabreEvPer.xsd',
    tableDependencies: ['S-1000'],
    receiptDependencies: ['S-1299'],
  },
  'S-1299': {
    eventElement: 'evtFechaEvPer',
    namespace:
      'http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00',
    xsdFile: 'evtFechaEvPer.xsd',
    tableDependencies: ['S-1000'],
    receiptDependencies: ['S-1200', 'S-1202', 'S-1207', 'S-1210'],
  },
};

test('promoted periodic builders match committed golden XML bytes', () => {
  for (const eventClass of PROMOTED_PERIODIC_EVENT_CLASSES) {
    const built = buildPeriodicEvent(periodicDtos[eventClass]);
    assert.equal(aggregateXml(built), golden(goldenFiles[eventClass]), eventClass);
    assert.deepEqual(
      built.map((record) => record.reference),
      expectedReferences[eventClass],
    );
    for (const record of built) {
      assert.equal(record.eventId, record.reference);
      assert.equal(record.source.tenantId, periodicDtos[eventClass].tenantId);
      assert.equal(record.operation, 'original');
      assert.match(record.xmlSha256, /^[a-f0-9]{64}$/);
    }
  }
});

test('promoted periodic metadata pins event code, leiaute, namespace, XSD, and dependencies', () => {
  for (const eventClass of PROMOTED_PERIODIC_EVENT_CLASSES) {
    const built = buildPeriodicEvent(periodicDtos[eventClass]);
    const metadata = PERIODIC_EVENT_METADATA[eventClass];
    const expectation = metadataExpectations[eventClass];

    assert.equal(metadata.eventCode, eventClass);
    assert.equal(metadata.leiauteVersion, 'S-1.3');
    assert.equal(metadata.rootElement, 'eSocial');
    assert.equal(metadata.eventElement, expectation.eventElement);
    assert.equal(metadata.namespace, expectation.namespace);
    assert.equal(metadata.xsdPath.endsWith(`/${expectation.xsdFile}`), true);
    assert.deepEqual(
      [...metadata.tableVersionDependencies],
      expectation.tableDependencies,
    );
    assert.deepEqual(
      [...metadata.receiptDependencies],
      expectation.receiptDependencies,
    );
    assert.equal(existsSync(join(root, metadata.xsdPath)), true);
    for (const record of built) {
      assert.deepEqual(record.metadata, metadata);
      assert.match(
        record.xml,
        new RegExp(`<eSocial xmlns="${escapeRegExp(metadata.namespace)}">`),
      );
      assert.match(
        record.xml,
        new RegExp(`<${metadata.eventElement} Id="${record.eventId}">`),
      );
    }
  }
});

test('promoted periodic builders reject invalid DTOs before signing or submission', () => {
  assert.throws(
    () =>
      buildPeriodicEvent({
        ...periodicDtos['S-1200'],
        tenantId: '',
      }),
    PeriodicBuilderValidationError,
  );

  assert.throws(
    () =>
      buildPeriodicEvent({
        ...periodicDtos['S-1200'],
        payrollRunStatus: 'APPROVED',
      }),
    /payrollRunStatus=GENERATED/,
  );

  assert.throws(
    () =>
      buildPeriodicEvent({
        ...periodicDtos['S-1207'],
        benefits: [
          {
            ...periodicDtos['S-1207'].benefits[0],
            activeBenefitCount: 2,
          },
        ],
      }),
    /exactly one active S-2410 benefit/,
  );

  assert.throws(
    () =>
      buildPeriodicEvent({
        ...periodicDtos['S-1210'],
        confirmedTotal: '9999.00',
      }),
    /confirmedTotal/,
  );

  assert.throws(
    () =>
      buildPeriodicEvent({
        ...periodicDtos['S-1298'],
        acceptedClosureReceipt: '',
      }),
    /acceptedClosureReceipt/,
  );

  assert.throws(
    () =>
      buildPeriodicEvent({
        ...periodicDtos['S-1299'],
        pendingPeriodicEvents: [
          {
            eventClass: 'S-1200',
            sourceEntityId: '00000000-0000-4000-8000-000000001200',
            employeeId: '00000000-0000-4000-8000-000000000001',
            reason: 'missing_receipt',
          },
        ],
      }),
    /accepted receipts/,
  );
});

test('promoted periodic builder source has no SGP database or module coupling', () => {
  const source = readFileSync(
    join(root, 'packages/domain/src/xml/builders/periodic/index.ts'),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"].*(hr|payroll|saude)\//);
  assert.doesNotMatch(source, /\b(hr|payroll|saude)\./);
  assert.doesNotMatch(source, /public\.esocial_event/);
  assert.doesNotMatch(source, /DatabaseService|QueryResultRow|@nestjs/);
});

function workerRemuneration(employeeId, registration, cpf, categoryCode, rubrics) {
  return {
    employeeId,
    registration,
    cpf,
    categoryCode,
    rubrics,
  };
}

function rubric(code, kind, amount) {
  return {
    code,
    tableCode: 'SGP',
    kind,
    amount,
    quantity: '1.0000',
  };
}

function payment(employeeId, cpf, amount) {
  return {
    employeeId,
    cpf,
    amount,
    paymentDate: '2026-01-25',
  };
}

function golden(fileName) {
  return readFileSync(
    join(root, 'docs/templates/golden/builders', fileName),
    'utf8',
  );
}

function aggregateXml(records) {
  return `${records.map((record) => record.xml.trimEnd()).join('\n---\n')}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
