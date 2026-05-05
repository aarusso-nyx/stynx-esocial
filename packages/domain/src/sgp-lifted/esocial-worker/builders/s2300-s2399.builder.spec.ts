import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2300Builder } from './s2300.builder';
import { S2399Builder } from './s2399.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000002300';

describe('S-2300 and S-2399 TS-V builders', () => {
  const validator = new XsdValidatorService();

  it.each([
    ['estagiario', tsvRow('estagiario')],
    ['conselheiro', tsvRow('conselheiro')],
    ['autonomo', tsvRow('autonomo')],
  ])('builds S-2300 golden XML for %s', async (fixture, row) => {
    const builder = new S2300Builder(database([[row], []]) as never);

    const record = await builder.build(row.contract_id);

    expect(record.xml).toBe(golden(`s2300-${fixture}.golden.xml`));
    expect(() =>
      validator.assertValid('S-2300', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });

  it.each([
    ['estagiario', tsvRow('estagiario')],
    ['conselheiro', tsvRow('conselheiro')],
    ['autonomo', tsvRow('autonomo')],
  ])('builds S-2399 golden XML for %s', async (fixture, row) => {
    const builder = new S2399Builder(
      database([
        [
          {
            contract_id: row.contract_id,
            tenant_id: row.tenant_id,
            tsv_category: row.tsv_category,
            end_date: row.end_date,
            employee_id: row.employee_id,
            employee_registration: row.employee_registration,
            employee_cpf: row.employee_cpf,
            employee_terminated_on: null,
            company_cnpj: row.company_cnpj,
          },
        ],
      ]) as never,
    );

    const record = await builder.build(row.contract_id);

    expect(record.xml).toBe(golden(`s2399-${fixture}.golden.xml`));
    expect(() =>
      validator.assertValid('S-2399', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function tsvRow(kind: 'estagiario' | 'conselheiro' | 'autonomo') {
  const data = {
    estagiario: {
      contractId: '00000000-0000-4000-8000-000000002301',
      category: '901',
      registration: 'TSV-EST-01',
      name: 'Ana Estagio',
      cpf: '11144477735',
      gender: 'FEMALE',
      role: 'Estagiario de Administracao',
      monthlyAmount: '1200.00',
      startDate: '2026-04-01',
      endDate: '2026-12-31',
      educationInstitution: 'Universidade Municipal',
      supervisorCpf: '22255588804',
    },
    conselheiro: {
      contractId: '00000000-0000-4000-8000-000000002302',
      category: '410',
      registration: 'TSV-CON-01',
      name: 'Bruno Conselheiro',
      cpf: '22255588804',
      gender: 'MALE',
      role: 'Conselheiro Tutelar',
      monthlyAmount: '3200.00',
      startDate: '2026-03-15',
      endDate: '2027-03-14',
      educationInstitution: null,
      supervisorCpf: null,
    },
    autonomo: {
      contractId: '00000000-0000-4000-8000-000000002303',
      category: '701',
      registration: 'TSV-AUT-01',
      name: 'Carla Autonoma',
      cpf: '33366699916',
      gender: 'FEMALE',
      role: 'Prestadora Autonoma',
      monthlyAmount: '2800.00',
      startDate: '2026-02-10',
      endDate: '2026-08-09',
      educationInstitution: null,
      supervisorCpf: null,
    },
  }[kind];

  return {
    contract_id: data.contractId,
    tenant_id: tenantId,
    tsv_category: data.category,
    start_date: data.startDate,
    end_date: data.endDate,
    role: data.role,
    monthly_amount: data.monthlyAmount,
    weekly_hours: '30.000000',
    education_institution: data.educationInstitution,
    internship_plan_uri: null,
    employee_id: data.contractId.replace('0000000023', '0000000033'),
    employee_registration: data.registration,
    employee_name: data.name,
    employee_social_name: null,
    employee_cpf: data.cpf,
    employee_birth_date: '1995-01-02',
    employee_gender: data.gender,
    employee_email: `${kind}@example.test`,
    employee_phone: '61999998888',
    employee_nationality_code: '105',
    employee_marital_status: '1',
    employee_education_level: '09',
    employee_address: {
      street: 'Rua Central',
      number: '100',
      neighborhood: 'Centro',
      zip: '70000000',
      cityCode: '5300108',
      state: 'DF',
    },
    employee_hired_on: data.startDate,
    supervisor_cpf: data.supervisorCpf,
    company_cnpj: '12345678000199',
    workplace_cnpj: '12345678000270',
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
