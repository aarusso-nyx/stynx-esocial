import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2200Builder } from './s2200.builder';
import { S2205Builder } from './s2205.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const employeeId = '00000000-0000-4000-8000-000000002200';

describe('S-2200 and S-2205 builders', () => {
  const validator = new XsdValidatorService();

  it('builds S-2200 golden XML for an employee with two dependents', async () => {
    const builder = new S2200Builder(
      database([
        [employeeRow()],
        [
          dependentRow('Ana Silva', '22233344405', '2015-02-03', true),
          dependentRow('Bruno Silva', '33344455506', '2018-06-07', false),
        ],
      ]) as never,
    );

    const record = await builder.build(tenantId, employeeId, '2026-01');
    expect(record.xml).toBe(golden('s2200.golden.xml'));
    expect(() =>
      validator.assertValid('S-2200', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });

  it('builds S-2205 golden XML for address and dependent changes', async () => {
    const builder = new S2205Builder(
      database([
        [
          {
            ...employeeRow(),
            updated_at: '2026-05-02T10:00:00.000Z',
          },
        ],
        [
          dependentRow('Ana Silva', '22233344405', '2015-02-03', true),
          dependentRow('Bruno Silva', '33344455506', '2018-06-07', false),
        ],
      ]) as never,
    );

    const record = await builder.build(tenantId, employeeId, '2026-01', [
      {
        id: '00000000-0000-4000-8000-000000002205',
        field_path: 'address.street',
      },
      { id: '00000000-0000-4000-8000-000000002206', field_path: 'dependent.*' },
    ] as never);
    expect(record.xml).toBe(golden('s2205.golden.xml'));
    expect(() =>
      validator.assertValid('S-2205', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function employeeRow() {
  return {
    id: employeeId,
    tenant_id: tenantId,
    registration: 'MAT-2200',
    name: 'Maria Silva',
    social_name: null,
    cpf: '11122233344',
    birth_date: '1990-01-02',
    gender: 'FEMALE',
    email: 'maria.silva@example.test',
    phone: '61999998888',
    pis_pasep: '12345678901',
    mother_name: 'Mae Silva',
    father_name: 'Pai Silva',
    nationality_code: '105',
    birth_city_code: '5300108',
    marital_status: '2',
    education_level: '09',
    address: {
      street: 'Rua Central',
      number: '100',
      neighborhood: 'Centro',
      zip: '70000000',
      cityCode: '5300108',
      state: 'DF',
    },
    hired_on: '2026-01-10',
    abono_permanencia_ativo: false,
    abono_permanencia_inicio: null,
    contract_type: 'EFETIVO',
    link_contract_type: 'statutory',
    job_position_name: 'Analista Municipal',
    job_function_name: null,
    exercise_on: '2026-01-10',
    starts_on: '2026-01-10',
    cnpj: '12345678000199',
  };
}

function dependentRow(
  name: string,
  cpf: string,
  birthDate: string,
  incomeTaxDependent: boolean,
) {
  return {
    name,
    cpf,
    birth_date: birthDate,
    relationship: 'filho',
    income_tax_dependent: incomeTaxDependent,
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
