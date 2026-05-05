import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2299Builder } from './s2299.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('S-2299 builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden XML for termination without indemnified notice', async () => {
    const builder = new S2299Builder(
      database([
        [
          pending(
            '00000000-0000-4000-8000-000000002299',
            '00000000-0000-4000-8000-000000004299',
          ),
        ],
        [termination('00000000-0000-4000-8000-000000004299')],
        [
          component('RESC_13_PROP', '500.00', '3.0000'),
          component('RESC_SALDO', '1500.00', '15.0000'),
        ],
      ]) as never,
    );

    const record = await builder.buildPending(
      tenantId,
      '00000000-0000-4000-8000-000000002299',
    );
    expect(record.xml).toBe(golden('s2299-without-notice.golden.xml'));
    expect(() =>
      validator.assertValid('S-2299', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });

  it('builds golden XML for termination with indemnified notice', async () => {
    const builder = new S2299Builder(
      database([
        [
          pending(
            '00000000-0000-4000-8000-000000002298',
            '00000000-0000-4000-8000-000000004298',
          ),
        ],
        [
          {
            ...termination('00000000-0000-4000-8000-000000004298'),
            termination_reason_code: 'SEM_JUSTA_CAUSA',
          },
        ],
        [
          component('RESC_AVISO_PREVIO', '3000.00', '30.0000'),
          component('RESC_SALDO', '1500.00', '15.0000'),
        ],
      ]) as never,
    );

    const record = await builder.buildPending(
      tenantId,
      '00000000-0000-4000-8000-000000002298',
    );
    expect(record.xml).toBe(golden('s2299-with-notice.golden.xml'));
    expect(() =>
      validator.assertValid('S-2299', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });

  it('blocks S-2299 when CALC-12 run is not GENERATED', async () => {
    const builder = new S2299Builder(
      database([
        [
          pending(
            '00000000-0000-4000-8000-000000002299',
            '00000000-0000-4000-8000-000000004299',
          ),
        ],
        [
          {
            ...termination('00000000-0000-4000-8000-000000004299'),
            run_status: 'DRAFT',
          },
        ],
      ]) as never,
    );

    await expect(
      builder.buildPending(tenantId, '00000000-0000-4000-8000-000000002299'),
    ).rejects.toThrow('payroll_run.status=GENERATED');
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function pending(id: string, calcRunId: string) {
  return {
    id,
    tenant_id: tenantId,
    employment_link_id: '00000000-0000-4000-8000-000000009999',
    employee_id: '00000000-0000-4000-8000-000000002200',
    calc_run_id: calcRunId,
  };
}

function termination(calcRunId: string) {
  return {
    tenant_id: tenantId,
    employment_link_id: '00000000-0000-4000-8000-000000009999',
    employee_id: '00000000-0000-4000-8000-000000002200',
    calc_run_id: calcRunId,
    run_status: 'GENERATED',
    competence_year: 2026,
    competence_month: 4,
    registration: 'MAT-2200',
    cpf: '11122233344',
    terminated_on: '2026-04-15',
    link_end_date: '2026-04-15',
    termination_reason_code: 'PEDIDO_EXONERACAO',
    cnpj: '12345678000199',
    branch_cnpj: '12345678000199',
    work_location_code: 'LOT01',
  };
}

function component(componentCode: string, amount: string, quantity: string) {
  return {
    component_code: componentCode,
    amount,
    quantity,
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
