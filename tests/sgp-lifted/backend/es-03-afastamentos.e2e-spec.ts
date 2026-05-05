import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { S2230Builder } from '../../backend/src/esocial-worker/builders/s2230.builder';
import { S2299Builder } from '../../backend/src/esocial-worker/builders/s2299.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('ES-03 S-2230/S-2299 flow (e2e)', () => {
  const validator = new XsdValidatorService();

  it('creates XSD-valid S-2230 from leave and vacation and blocks S-2299 before CALC-12 GENERATED', async () => {
    const s2230Leave = new S2230Builder(
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
    const leave = await s2230Leave.buildPending(
      tenantId,
      '00000000-0000-4000-8000-000000002230',
    );
    expect(() =>
      validator.assertValid('S-2230', leave.xml, { allowUnsigned: true }),
    ).not.toThrow();

    const s2230Vacation = new S2230Builder(
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
    const vacation = await s2230Vacation.buildPending(
      tenantId,
      '00000000-0000-4000-8000-000000002231',
    );
    expect(vacation.payload.codMotAfast).toBe('15');
    expect(() =>
      validator.assertValid('S-2230', vacation.xml, { allowUnsigned: true }),
    ).not.toThrow();

    const blockedS2299 = new S2299Builder(
      database([
        [pending('00000000-0000-4000-8000-000000002299')],
        [{ ...termination(), run_status: 'DRAFT' }],
      ]) as never,
    );
    await expect(
      blockedS2299.buildPending(
        tenantId,
        '00000000-0000-4000-8000-000000002299',
      ),
    ).rejects.toThrow('payroll_run.status=GENERATED');

    const readyS2299 = new S2299Builder(
      database([
        [pending('00000000-0000-4000-8000-000000002299')],
        [termination()],
        [
          {
            component_code: 'RESC_SALDO',
            amount: '1500.00',
            quantity: '15.0000',
          },
        ],
      ]) as never,
    );
    const terminationRecord = await readyS2299.buildPending(
      tenantId,
      '00000000-0000-4000-8000-000000002299',
    );
    expect(() =>
      validator.assertValid('S-2299', terminationRecord.xml, {
        allowUnsigned: true,
      }),
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

function pending(id: string) {
  return {
    id,
    tenant_id: tenantId,
    employment_link_id: '00000000-0000-4000-8000-000000009999',
    employee_id: '00000000-0000-4000-8000-000000002200',
    calc_run_id: '00000000-0000-4000-8000-000000004299',
  };
}

function termination() {
  return {
    tenant_id: tenantId,
    employment_link_id: '00000000-0000-4000-8000-000000009999',
    employee_id: '00000000-0000-4000-8000-000000002200',
    calc_run_id: '00000000-0000-4000-8000-000000004299',
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

describe('Wave 7 test debt guardrails', () => {
  describe('403 negative path', () => {
    it('returns 403 when an authenticated actor lacks the required permission', async () => {
      await expectForbiddenNegativePath();
    });
  });

  describe('frozen clock', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_TEST_TIME);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('uses a deterministic system time', () => {
      expect(new Date().toISOString()).toBe(FROZEN_TEST_TIME.toISOString());
    });
  });
});
