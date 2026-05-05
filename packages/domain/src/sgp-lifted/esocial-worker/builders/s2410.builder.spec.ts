import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2410Builder } from './s2410.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000002410';
const retirementGrantId = '00000000-0000-4000-8000-000000002413';
const pensionGrantId = '00000000-0000-4000-8000-000000002414';
const employeeId = '00000000-0000-4000-8000-000000002411';

describe('S2410Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-2410 XML for an RPPS retirement benefit grant', async () => {
    const builder = new S2410Builder(
      database([
        [
          {
            retirement_grant_id: retirementGrantId,
            tenant_id: tenantId,
            employee_id: employeeId,
            employee_registration: 'RPPS-001',
            employee_cpf: '11144477735',
            granted_on: '2026-04-25',
            legal_basis: 'Lei Municipal 1/2026',
            appointment_act: 'Portaria 10/2026',
            rule_name: 'Aposentadoria voluntaria RPPS',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    const record = await builder.buildRetirementGrant(retirementGrantId);

    expect(record.xml).toBe(golden('s2410-retirement.golden.xml'));
    expect(() =>
      validator.assertValid('S-2410', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(record.payload).toMatchObject({
      sourceKind: 'RETIREMENT',
      retirementGrantId,
      employeeId,
      cpfBenef: '11144477735',
      nrBeneficio: 'RET08000000000002413',
      tpBeneficio: '0101',
    });
  });

  it('builds golden S-2410 XML for an RPPS pension benefit grant', async () => {
    const builder = new S2410Builder(
      database([
        [
          {
            pension_grant_id: pensionGrantId,
            tenant_id: tenantId,
            instituting_employee_id: employeeId,
            instituting_registration: 'RPPS-001',
            instituting_cpf: '33366699943',
            beneficiary_cpf: '11144477735',
            benefit_type: '0601',
            apportionment_type: 'VITALICIA',
            nature: 'PENSION_DEATH',
            granted_on: '2026-05-02',
            legal_basis: 'Lei Municipal 2/2026',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    const record = await builder.buildPensionGrant(pensionGrantId);

    expect(record.xml).toBe(golden('s2410-pension.golden.xml'));
    expect(() =>
      validator.assertValid('S-2410', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(record.payload).toMatchObject({
      sourceKind: 'PENSION',
      pensionGrantId,
      institutingEmployeeId: employeeId,
      cpfBenef: '11144477735',
      cpfInstituidor: '33366699943',
      nrBeneficio: 'PEN08000000000002414',
      tpBeneficio: '0601',
    });
  });

  it('rejects benefit grants without a valid beneficiary CPF', async () => {
    const builder = new S2410Builder(
      database([
        [
          {
            retirement_grant_id: retirementGrantId,
            tenant_id: tenantId,
            employee_id: employeeId,
            employee_registration: 'RPPS-001',
            employee_cpf: null,
            granted_on: '2026-04-25',
            legal_basis: 'Lei Municipal 1/2026',
            appointment_act: 'Portaria 10/2026',
            rule_name: 'Aposentadoria voluntaria RPPS',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    await expect(
      builder.buildRetirementGrant(retirementGrantId),
    ).rejects.toThrow('beneficiary CPF');
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
