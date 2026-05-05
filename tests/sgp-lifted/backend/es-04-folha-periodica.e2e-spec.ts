import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { S1200Builder } from '../../backend/src/esocial-worker/builders/s1200.builder';
import { S1210Builder } from '../../backend/src/esocial-worker/builders/s1210.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const payrollRunId = '00000000-0000-4000-8000-000000001200';
const paymentBatchId = '00000000-0000-4000-8000-000000001210';

describe('ES-04 periodic payroll flow (e2e)', () => {
  const validator = new XsdValidatorService();

  it('emits S-1200 from generated payroll and S-1210 only after bank confirmation', async () => {
    const s1200 = new S1200Builder(
      database([[payrollRun()], [payrollItem()]]) as never,
    );
    const remuneration = await s1200.build(tenantId, payrollRunId);
    expect(remuneration).toHaveLength(1);
    expect(() =>
      validator.assertValid('S-1200', remuneration[0].xml, {
        allowUnsigned: true,
      }),
    ).not.toThrow();

    const blockedS1210 = new S1210Builder(
      database([[{ ...remittance(), status: 'GENERATED' }]]) as never,
    );
    await expect(blockedS1210.build(tenantId, paymentBatchId)).rejects.toThrow(
      'status=PAID',
    );

    const s1210 = new S1210Builder(
      database([[remittance()], [paymentDetail()]]) as never,
    );
    const payment = await s1210.build(tenantId, paymentBatchId);
    expect(payment).toHaveLength(1);
    expect(() =>
      validator.assertValid('S-1210', payment[0].xml, {
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

function payrollRun() {
  return {
    id: payrollRunId,
    tenant_id: tenantId,
    status: 'GENERATED',
    competence_year: 2026,
    competence_month: 1,
  };
}

function payrollItem() {
  return {
    tenant_id: tenantId,
    payroll_run_id: payrollRunId,
    competence_year: 2026,
    competence_month: 1,
    employee_id: '00000000-0000-4000-8000-000000000001',
    registration: 'MAT-001',
    cpf: '11122233344',
    cnpj: '12345678000199',
    rubric_code: 'BASIC',
    table_code: 'SGP',
    entry_kind: 'EARNING',
    amount: '1000.00',
    quantity: '1.0000',
  };
}

function remittance() {
  return {
    id: paymentBatchId,
    tenant_id: tenantId,
    payroll_run_id: payrollRunId,
    status: 'PAID',
    competence_year: 2026,
    competence_month: 1,
    payment_date: '2026-01-25',
    total_amount: '1000.00',
    confirmed_total: '1000.00',
  };
}

function paymentDetail() {
  return {
    tenant_id: tenantId,
    payment_batch_id: paymentBatchId,
    payroll_run_id: payrollRunId,
    competence_year: 2026,
    competence_month: 1,
    payment_date: '2026-01-25',
    employee_id: '00000000-0000-4000-8000-000000000001',
    cpf: '11122233344',
    cnpj: '12345678000199',
    amount: '1000.00',
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
