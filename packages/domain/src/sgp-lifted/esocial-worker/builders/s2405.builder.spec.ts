import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2405Builder } from './s2405.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000002405';
const retirementGrantId = '00000000-0000-4000-8000-000000002451';
const recertificationRecordId = '00000000-0000-4000-8000-000000002452';
const employeeId = '00000000-0000-4000-8000-000000002453';

describe('S2405Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-2405 XML for an RPPS beneficiary cadastral change', async () => {
    const builder = new S2405Builder(
      database([
        [
          {
            recertification_record_id: recertificationRecordId,
            retirement_grant_id: retirementGrantId,
            tenant_id: tenantId,
            employee_id: employeeId,
            granted_on: '2026-04-25',
            recertified_on: '2026-05-02',
            employee_name: 'Maria Beneficiaria Atualizada',
            employee_cpf: '11144477735',
            employee_gender: 'FEMALE',
            employee_marital_status: '2',
            employee_address: {
              street: 'Rua Atualizada',
              number: '200',
              neighborhood: 'Centro',
              zip: '70000001',
              cityCode: '5300108',
              state: 'DF',
            },
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    const record = await builder.build(recertificationRecordId);

    expect(record.xml).toBe(golden('s2405.golden.xml'));
    expect(() =>
      validator.assertValid('S-2405', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(record.payload).toMatchObject({
      recertificationRecordId,
      retirementGrantId,
      employeeId,
      cpfBenef: '11144477735',
      alterationDate: '2026-05-02',
    });
  });

  it('rejects alterations that are not after the S-2400 start date', async () => {
    const builder = new S2405Builder(
      database([
        [
          {
            recertification_record_id: recertificationRecordId,
            retirement_grant_id: retirementGrantId,
            tenant_id: tenantId,
            employee_id: employeeId,
            granted_on: '2026-04-25',
            recertified_on: '2026-04-25',
            employee_name: 'Maria Beneficiaria',
            employee_cpf: '11144477735',
            employee_gender: 'FEMALE',
            employee_marital_status: '2',
            employee_address: {},
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    await expect(builder.build(recertificationRecordId)).rejects.toThrow(
      'alteration date',
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
