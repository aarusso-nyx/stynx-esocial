import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2206Builder } from './s2206.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const employeeId = '00000000-0000-4000-8000-000000002200';
const promotionId = '00000000-0000-4000-8000-000000002206';

describe('S-2206 builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden XML for a promotion contract alteration', async () => {
    const builder = new S2206Builder(
      database([[employeeContractRow()]]) as never,
    );

    const record = await builder.build(tenantId, employeeId, {
      sourceId: promotionId,
      changeKind: 'PROMOTION',
      changeDate: '2026-05-02',
      effectiveDate: '2026-05-01',
      description: 'Promocao por merecimento',
    });

    expect(record.xml).toBe(golden('s2206-promotion.golden.xml'));
    expect(record.payload).toMatchObject({
      eventKind: 'S-2206',
      changeKind: 'PROMOTION',
      codCateg: '301',
      tpRegPrev: '2',
    });
    expect(() =>
      validator.assertValid('S-2206', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function employeeContractRow() {
  return {
    employee_id: employeeId,
    tenant_id: tenantId,
    registration: 'MAT-2206',
    cpf: '11122233344',
    updated_at: '2026-05-02T10:00:00.000Z',
    hired_on: '2026-01-10',
    abono_permanencia_ativo: false,
    contract_starts_on: '2026-01-10',
    employment_link_id: '00000000-0000-4000-8000-000000002216',
    link_contract_type: 'statutory',
    link_updated_at: '2026-05-02T10:00:00.000Z',
    link_end_date: null,
    job_position_name: 'Analista Municipal II',
    job_function_name: 'Coordenador de Cadastro',
    company_cnpj: '12345678000199',
    branch_cnpj: '12345678000199',
    work_location_name: 'Secretaria de Administracao',
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
