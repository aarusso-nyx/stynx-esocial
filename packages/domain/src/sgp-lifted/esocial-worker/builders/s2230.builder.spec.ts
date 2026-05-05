import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2230Builder } from './s2230.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('S-2230 builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden XML for medical leave', async () => {
    const builder = new S2230Builder(
      database([
        [
          {
            id: '00000000-0000-4000-8000-000000002230',
            tenant_id: tenantId,
            leave_or_vacation_id: '00000000-0000-4000-8000-000000003230',
            kind: 'LEAVE',
            trigger_event: 'START',
          },
        ],
        [leaveRow()],
      ]) as never,
    );

    const record = await builder.buildPending(
      tenantId,
      '00000000-0000-4000-8000-000000002230',
    );
    expect(record.xml).toBe(golden('s2230-medical-leave.golden.xml'));
    expect(() =>
      validator.assertValid('S-2230', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });

  it('builds golden XML for vacation with codMotAfast 15', async () => {
    const builder = new S2230Builder(
      database([
        [
          {
            id: '00000000-0000-4000-8000-000000002231',
            tenant_id: tenantId,
            leave_or_vacation_id: '00000000-0000-4000-8000-000000003231',
            kind: 'VACATION',
            trigger_event: 'START',
          },
        ],
        [vacationRow()],
      ]) as never,
    );

    const record = await builder.buildPending(
      tenantId,
      '00000000-0000-4000-8000-000000002231',
    );
    expect(record.xml).toBe(golden('s2230-vacation.golden.xml'));
    expect(record.payload.codMotAfast).toBe('15');
    expect(() =>
      validator.assertValid('S-2230', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function leaveRow() {
  return {
    id: '00000000-0000-4000-8000-000000003230',
    tenant_id: tenantId,
    employee_id: '00000000-0000-4000-8000-000000002200',
    registration: 'MAT-2200',
    cpf: '11122233344',
    starts_on: '2026-04-01',
    ends_on: '2026-04-15',
    notes: 'Licenca medica homologada',
    cnpj: '12345678000199',
    absence_reason_code: 'MED',
    absence_reason_description: 'Licenca saude',
    accrual_period_start: null,
    accrual_period_end: null,
  };
}

function vacationRow() {
  return {
    id: '00000000-0000-4000-8000-000000003231',
    tenant_id: tenantId,
    employee_id: '00000000-0000-4000-8000-000000002200',
    registration: 'MAT-2200',
    cpf: '11122233344',
    starts_on: '2026-05-04',
    ends_on: '2026-05-23',
    notes: null,
    cnpj: '12345678000199',
    absence_reason_code: null,
    absence_reason_description: null,
    accrual_period_start: '2025-01-10',
    accrual_period_end: '2026-01-09',
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
