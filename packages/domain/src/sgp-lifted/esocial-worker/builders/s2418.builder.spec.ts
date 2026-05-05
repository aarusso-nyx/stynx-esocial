import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2418Builder } from './s2418.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000002418';
const retirementGrantId = '00000000-0000-4000-8000-000000002413';
const pensionGrantId = '00000000-0000-4000-8000-000000002414';
const employeeId = '00000000-0000-4000-8000-000000002411';

describe('S2418Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-2418 XML for a suspended retirement benefit reactivation', async () => {
    const builder = new S2418Builder(
      database([
        [
          {
            retirement_grant_id: retirementGrantId,
            tenant_id: tenantId,
            employee_id: employeeId,
            employee_cpf: '11144477735',
            status: 'SUSPENSA',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    const record = await builder.buildRetirementReactivation({
      sourceId: retirementGrantId,
      effectiveReactivationOn: '2026-05-15',
      financialEffectOn: '2026-05-01',
    });

    expect(record.xml).toBe(golden('s2418-retirement.golden.xml'));
    expect(() =>
      validator.assertValid('S-2418', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(record.payload).toMatchObject({
      sourceKind: 'RETIREMENT',
      retirementGrantId,
      employeeId,
      cpfBenef: '11144477735',
      nrBeneficio: 'RET08000000000002413',
      dtEfetReativ: '2026-05-15',
      dtEfeito: '2026-05-01',
      sourceStatus: 'SUSPENSA',
    });
  });

  it('builds golden S-2418 XML for a ceased pension benefit reactivation', async () => {
    const builder = new S2418Builder(
      database([
        [
          {
            pension_grant_id: pensionGrantId,
            tenant_id: tenantId,
            instituting_employee_id: employeeId,
            beneficiary_cpf: '11144477735',
            ceased_on: '2026-04-30',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    const record = await builder.buildPensionReactivation({
      sourceId: pensionGrantId,
      effectiveReactivationOn: '2026-05-15',
      financialEffectOn: '2026-05-01',
    });

    expect(record.xml).toBe(golden('s2418-pension.golden.xml'));
    expect(() =>
      validator.assertValid('S-2418', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(record.payload).toMatchObject({
      sourceKind: 'PENSION',
      pensionGrantId,
      institutingEmployeeId: employeeId,
      cpfBenef: '11144477735',
      nrBeneficio: 'PEN08000000000002414',
      dtEfetReativ: '2026-05-15',
      dtEfeito: '2026-05-01',
      previousCessationOn: '2026-04-30',
    });
  });

  it('rejects pension reactivation before the recorded cessation date', async () => {
    const builder = new S2418Builder(
      database([
        [
          {
            pension_grant_id: pensionGrantId,
            tenant_id: tenantId,
            instituting_employee_id: employeeId,
            beneficiary_cpf: '11144477735',
            ceased_on: '2026-05-15',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    await expect(
      builder.buildPensionReactivation({
        sourceId: pensionGrantId,
        effectiveReactivationOn: '2026-05-15',
        financialEffectOn: '2026-05-01',
      }),
    ).rejects.toThrow('after benefit cessation');
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
