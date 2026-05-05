import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2210Builder } from './s2210.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('S-2210 builder', () => {
  const validator = new XsdValidatorService();

  it.each([
    ['INICIAL', 's2210-inicial.golden.xml'],
    ['REABERTURA', 's2210-reabertura.golden.xml'],
    ['OBITO', 's2210-obito.golden.xml'],
  ])('builds XSD-valid %s XML', async (catKind, goldenFile) => {
    const catEmissionId = catId(catKind);
    const builder = new S2210Builder(
      database([
        [{ tenant_id: tenantId, cat_emission_id: catEmissionId }],
        [catRow(catEmissionId, catKind as never)],
      ]) as never,
    );

    const record = await builder.buildPending(tenantId, catEmissionId);
    expect(record.xml).toBe(golden(goldenFile));
    expect(record.payload).toMatchObject({ workEnvironmentCode: 'AMB01' });
    expect(() =>
      validator.assertValid('S-2210', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function catId(catKind: string): string {
  if (catKind === 'REABERTURA') return '00000000-0000-4000-8000-000000002211';
  if (catKind === 'OBITO') return '00000000-0000-4000-8000-000000002212';
  return '00000000-0000-4000-8000-000000002210';
}

function catRow(
  catEmissionId: string,
  catKind: 'INICIAL' | 'REABERTURA' | 'OBITO',
) {
  return {
    cat_emission_id: catEmissionId,
    tenant_id: tenantId,
    work_accident_id: '00000000-0000-4000-8000-000000002200',
    employee_id: '00000000-0000-4000-8000-000000002201',
    registration: 'MAT-2210',
    cpf: '11122233344',
    cnpj: '12345678000199',
    work_environment_code: 'AMB01',
    accident_at: '2026-05-01T10:30:00.000Z',
    accident_type: 'TIPICO',
    location_text: 'Patio operacional',
    body_part_code: '000000001',
    agent_cause_code: '000000002',
    witness_text: 'Testemunha informou queda no patio',
    severity: catKind === 'OBITO' ? 'FATAL' : 'GRAVE',
    death_at: catKind === 'OBITO' ? '2026-05-02T11:00:00.000Z' : null,
    cat_kind: catKind,
    emitted_at: '2026-05-02T12:00:00.000Z',
    doctor_crm: 'CRM-SP 12345',
    doctor_name: 'Dra CAT',
    internment: catKind !== 'INICIAL',
    leave_until: catKind === 'OBITO' ? null : '2026-05-12',
    origin_receipt: '1.1.0000000000000000000',
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
