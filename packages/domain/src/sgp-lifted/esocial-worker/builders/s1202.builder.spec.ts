import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1202Builder } from './s1202.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000120';
const payrollRunId = '00000000-0000-4000-8000-000000001202';

describe('S1202Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-1202 XML for RPPS statutory and commissioned workers', async () => {
    const builder = new S1202Builder(
      database([[payrollRun()], payrollItems()]) as never,
    );

    const records = await builder.build(tenantId, payrollRunId);

    expect(records).toHaveLength(2);
    expect(normalize(records.map((record) => record.xml).join('\n---\n'))).toBe(
      normalize(golden('s1202-rpps-workers.golden.xml')),
    );
    for (const record of records) {
      expect(() =>
        validator.assertValid('S-1202', record.xml, { allowUnsigned: true }),
      ).not.toThrow();
      expect(record.payload.totalsByRubric).toBeDefined();
    }
    expect(records[0].payload).toMatchObject({
      codCateg: '301',
      totalsByRubric: {
        BASIC: '5000.00',
        RPPS: '700.00',
        IRRF: '350.00',
      },
    });
    expect(records[1].payload).toMatchObject({
      codCateg: '302',
      totalsByTpRubrica: {
        EARNING: '3200.00',
        DEDUCTION: '448.00',
      },
    });
  });

  it('blocks S-1202 before payroll run is GENERATED', async () => {
    const builder = new S1202Builder(
      database([[{ ...payrollRun(), status: 'APPROVED' }]]) as never,
    );

    await expect(builder.build(tenantId, payrollRunId)).rejects.toThrow(
      'payroll_run.status=GENERATED',
    );
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function payrollRun() {
  return {
    id: payrollRunId,
    tenant_id: tenantId,
    status: 'GENERATED',
    competence_year: 2026,
    competence_month: 1,
  };
}

function payrollItems() {
  return [
    item(
      '00000000-0000-4000-8000-000000000301',
      'RPPS-001',
      '11122233344',
      'statutory',
      'BASIC',
      'EARNING',
      '5000.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000301',
      'RPPS-001',
      '11122233344',
      'statutory',
      'RPPS',
      'DEDUCTION',
      '700.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000301',
      'RPPS-001',
      '11122233344',
      'statutory',
      'IRRF',
      'DEDUCTION',
      '350.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000302',
      'RPPS-002',
      '22233344405',
      'commissioned',
      'BASIC',
      'EARNING',
      '3200.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000302',
      'RPPS-002',
      '22233344405',
      'commissioned',
      'RPPS',
      'DEDUCTION',
      '448.00',
    ),
  ];
}

function item(
  employeeId: string,
  registration: string,
  workerCpf: string,
  contractType: string,
  rubricCode: string,
  entryKind: string,
  amount: string,
) {
  return {
    tenant_id: tenantId,
    payroll_run_id: payrollRunId,
    competence_year: 2026,
    competence_month: 1,
    employee_id: employeeId,
    registration,
    cpf: workerCpf,
    cnpj: '12345678000199',
    contract_type: contractType,
    rubric_code: rubricCode,
    table_code: 'SGP',
    entry_kind: entryKind,
    amount,
    quantity: '1.0000',
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}

function normalize(value: string): string {
  return value.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
}
