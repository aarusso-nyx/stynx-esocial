import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2416Builder } from './s2416.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000002410';
const pensionGrantId = '00000000-0000-4000-8000-000000002414';
const employeeId = '00000000-0000-4000-8000-000000002411';

describe('S2416Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-2416 XML for an RPPS pension founder update', async () => {
    const builder = new S2416Builder(
      database([
        [
          {
            pension_grant_id: pensionGrantId,
            tenant_id: tenantId,
            instituting_employee_id: employeeId,
            instituting_registration: 'RPPS-001',
            instituting_cpf: '33366699943',
            beneficiary_cpf: '11144477735',
            kinship: 'Conjuge',
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

    expect(record.xml).toBe(golden('s2416-pension-founder.golden.xml'));
    expect(() =>
      validator.assertValid('S-2416', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(record.payload).toMatchObject({
      sourceKind: 'PENSION',
      pensionGrantId,
      institutingEmployeeId: employeeId,
      cpfBenef: '11144477735',
      cpfInstituidor: '33366699943',
      nrBeneficio: 'PEN08000000000002414',
      tpBeneficio: '0601',
      tpDepInst: '01',
    });
  });

  it('rejects pension founder updates without a valid beneficiary CPF', async () => {
    const builder = new S2416Builder(
      database([
        [
          {
            pension_grant_id: pensionGrantId,
            tenant_id: tenantId,
            instituting_employee_id: employeeId,
            instituting_registration: 'RPPS-001',
            instituting_cpf: '33366699943',
            beneficiary_cpf: null,
            kinship: 'Conjuge',
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

    await expect(builder.buildPensionGrant(pensionGrantId)).rejects.toThrow(
      'beneficiary CPF',
    );
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
