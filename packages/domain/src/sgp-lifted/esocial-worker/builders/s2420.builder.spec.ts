import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2420Builder } from './s2420.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000002420';
const pensionGrantId = '00000000-0000-4000-8000-000000002424';

describe('S2420Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-2420 XML for an RPPS pension benefit termination', async () => {
    const builder = new S2420Builder(
      database([
        [
          {
            pension_grant_id: pensionGrantId,
            tenant_id: tenantId,
            beneficiary_cpf: '11144477735',
            granted_on: '2026-05-02',
            ceased_on: '2026-06-30',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    const record = await builder.buildPensionGrant(pensionGrantId);

    expect(record.xml).toBe(golden('s2420-pension.golden.xml'));
    expect(() =>
      validator.assertValid('S-2420', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(record.payload).toMatchObject({
      sourceKind: 'PENSION',
      pensionGrantId,
      cpfBenef: '11144477735',
      nrBeneficio: 'PEN08000000000002424',
      grantedOn: '2026-05-02',
      terminatedOn: '2026-06-30',
      mtvTermino: '05',
    });
  });

  it('rejects a pension grant without a termination date', async () => {
    const builder = new S2420Builder(
      database([
        [
          {
            pension_grant_id: pensionGrantId,
            tenant_id: tenantId,
            beneficiary_cpf: '11144477735',
            granted_on: '2026-05-02',
            ceased_on: null,
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    await expect(builder.buildPensionGrant(pensionGrantId)).rejects.toThrow(
      'pension.ceased_on',
    );
  });

  it('rejects a termination date before the benefit start date', async () => {
    const builder = new S2420Builder(
      database([
        [
          {
            pension_grant_id: pensionGrantId,
            tenant_id: tenantId,
            beneficiary_cpf: '11144477735',
            granted_on: '2026-05-02',
            ceased_on: '2026-04-30',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    await expect(builder.buildPensionGrant(pensionGrantId)).rejects.toThrow(
      'termination date',
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
