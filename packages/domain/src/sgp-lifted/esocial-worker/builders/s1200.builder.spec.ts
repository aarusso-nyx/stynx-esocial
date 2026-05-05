import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1200Builder } from './s1200.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const payrollRunId = '00000000-0000-4000-8000-000000001200';

describe('S1200Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-1200 XML for three workers with mixed rubrics', async () => {
    const builder = new S1200Builder(
      database([[payrollRun()], payrollItems()]) as never,
    );

    const records = await builder.build(tenantId, payrollRunId);

    expect(records).toHaveLength(3);
    expect(normalize(records.map((record) => record.xml).join('\n---\n'))).toBe(
      normalize(golden('s1200-three-workers.golden.xml')),
    );
    for (const record of records) {
      expect(() =>
        validator.assertValid('S-1200', record.xml, { allowUnsigned: true }),
      ).not.toThrow();
      expect(record.payload.totalsByTpRubrica).toBeDefined();
    }
  });

  it('blocks S-1200 before payroll run is GENERATED', async () => {
    const builder = new S1200Builder(
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
      '00000000-0000-4000-8000-000000000001',
      'MAT-001',
      '11122233344',
      'BASIC',
      'EARNING',
      '3000.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000001',
      'MAT-001',
      '11122233344',
      'RPPS',
      'DEDUCTION',
      '330.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000002',
      'MAT-002',
      '22233344405',
      'BASIC',
      'EARNING',
      '4200.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000002',
      'MAT-002',
      '22233344405',
      'IRRF',
      'DEDUCTION',
      '245.50',
    ),
    item(
      '00000000-0000-4000-8000-000000000003',
      'MAT-003',
      '33344455506',
      'AUX',
      'INFORMATION',
      '800.00',
    ),
    item(
      '00000000-0000-4000-8000-000000000003',
      'MAT-003',
      '33344455506',
      'BASIC',
      'EARNING',
      '2800.00',
    ),
  ];
}

function item(
  employeeId: string,
  registration: string,
  workerCpf: string,
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
