import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1207Builder } from './s1207.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000001207';
const payrollRunId = '00000000-0000-4000-8000-000000001207';
const employeeId = '00000000-0000-4000-8000-000000001201';
const retirementGrantId = '00000000-0000-4000-8000-000000002413';

describe('S1207Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-1207 XML reconciled to an S-2410 retirement benefit grant', async () => {
    const builder = new S1207Builder(
      database([[payrollRun()], retirementBenefitItems()]) as never,
    );

    const records = await builder.build(tenantId, payrollRunId);

    expect(records).toHaveLength(1);
    expect(records[0].xml).toBe(golden('s1207-rpps-benefit.golden.xml'));
    expect(() =>
      validator.assertValid('S-1207', records[0].xml, {
        allowUnsigned: true,
      }),
    ).not.toThrow();
    expect(records[0].payload).toMatchObject({
      sourceKind: 'RETIREMENT',
      benefitSourceId: retirementGrantId,
      nrBeneficio: 'RET08000000000002413',
      cpfBenef: '11144477735',
      rubricCount: 2,
      totalsByTpRubrica: {
        EARNING: '5200.00',
        DEDUCTION: '572.00',
      },
    });
  });

  it('blocks ambiguous payroll rows with multiple active benefits', async () => {
    const builder = new S1207Builder(
      database([
        [payrollRun()],
        [
          {
            ...retirementBenefitItems()[0],
            active_benefit_count: '2',
          },
        ],
      ]) as never,
    );

    await expect(builder.build(tenantId, payrollRunId)).rejects.toThrow(
      'exactly one active S-2410 benefit',
    );
  });

  it('blocks S-1207 before payroll run is GENERATED', async () => {
    const builder = new S1207Builder(
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
    competence_month: 5,
  };
}

function retirementBenefitItems() {
  return [
    item('PROV', 'EARNING', '5200.00'),
    item('RPPS', 'DEDUCTION', '572.00'),
  ];
}

function item(rubricCode: string, entryKind: string, amount: string) {
  return {
    tenant_id: tenantId,
    payroll_run_id: payrollRunId,
    competence_year: 2026,
    competence_month: 5,
    employee_id: employeeId,
    beneficiary_cpf: '11144477735',
    cnpj: '12345678000199',
    benefit_source_kind: 'RETIREMENT',
    benefit_source_id: retirementGrantId,
    nr_beneficio: 'RET08000000000002413',
    active_benefit_count: '1',
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
