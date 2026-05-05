import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2220Builder } from './s2220.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('S-2220 builder', () => {
  const validator = new XsdValidatorService();

  it.each([
    ['ADMISSIONAL', 's2220-admissional.golden.xml', []],
    [
      'PERIODICO',
      's2220-periodico.golden.xml',
      [exam('0281', 'Audiometria', 'Normal')],
    ],
    ['RETORNO_TRABALHO', 's2220-retorno-trabalho.golden.xml', []],
    ['DEMISSIONAL', 's2220-demissional.golden.xml', []],
  ])('builds XSD-valid %s XML', async (asoKind, goldenFile, exams) => {
    const index = [
      'ADMISSIONAL',
      'PERIODICO',
      'RETORNO_TRABALHO',
      'DEMISSIONAL',
    ].indexOf(asoKind);
    const asoRecordId = `00000000-0000-4000-8000-00000000222${index}`;
    const builder = new S2220Builder(
      database([
        [{ tenant_id: tenantId, aso_record_id: asoRecordId }],
        [asoRow(asoRecordId, asoKind)],
        exams,
      ]) as never,
    );

    const record = await builder.buildPending(tenantId, asoRecordId);
    expect(record.xml).toBe(golden(goldenFile));
    expect(record.payload).toMatchObject({ workEnvironmentCode: 'AMB01' });
    expect(() =>
      validator.assertValid('S-2220', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });

  it('keeps missing CRM as XSD-invalid input for queue retry diagnostics', async () => {
    const asoRecordId = '00000000-0000-4000-8000-000000002224';
    const builder = new S2220Builder(
      database([
        [{ tenant_id: tenantId, aso_record_id: asoRecordId }],
        [{ ...asoRow(asoRecordId, 'ADMISSIONAL'), doctor_crm: null }],
        [],
      ]) as never,
    );
    const record = await builder.buildPending(tenantId, asoRecordId);
    expect(() =>
      validator.assertValid('S-2220', record.xml, { allowUnsigned: true }),
    ).toThrow('failed XSD validation');
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function asoRow(id: string, asoKind: string) {
  return {
    id,
    tenant_id: tenantId,
    employee_id: '00000000-0000-4000-8000-000000002200',
    registration: 'MAT-2220',
    cpf: '11122233344',
    aso_kind: asoKind,
    performed_at: '2026-05-02',
    scheduled_at: '2026-05-01',
    doctor_crm: 'CRM-SP 12345',
    doctor_name: 'Dra Monitoramento',
    conclusion: 'APTO',
    cnpj: '12345678000199',
    work_environment_code: 'AMB01',
  };
}

function exam(code: string, name: string, resultSummary: string) {
  return {
    code,
    name,
    result_summary: resultSummary,
    created_at: '2026-05-02',
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
