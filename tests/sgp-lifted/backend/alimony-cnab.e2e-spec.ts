import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { Cnab240EmitService } from '../../backend/src/integrations-worker/cnab240/cnab240-emit.service';

describe('BANK-04 alimony CNAB gate', () => {
  it('includes one judicial credit line per beneficiary with alimony purpose code', async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: jest.fn(async (sql: string, values: unknown[] = []) => {
        queries.push({ sql, values });
        if (sql.includes('FROM payroll.payment_remittance_file prf')) {
          return {
            rows: [
              {
                remittance_id: remittanceId,
                tenant_id: tenantId,
                payroll_run_id: payrollRunId,
                competence_year: 2026,
                competence_month: 5,
                payment_date: '2026-05-25',
                file_name: null,
                payroll_status: 'APPROVED',
                company_name: 'Municipio Teste',
                company_registration: '12345678000199',
              },
            ],
          };
        }
        if (sql.includes('FROM hr.bank')) {
          return { rows: [{ bank_id: bankId, bank_code: '001' }] };
        }
        if (sql.includes('WITH employee_net AS')) {
          return { rows: [] };
        }
        if (sql.includes('FROM hr.employee_alimony alimony')) {
          return {
            rows: [
              alimonyRow(alimonyAId, 'Maria A', '0001-1', '100.00'),
              alimonyRow(alimonyBId, 'Maria B', '0002-2', '150.00'),
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const service = new Cnab240EmitService({
      transaction: (
        callback: (transactionClient: typeof client) => Promise<unknown>,
      ) => callback(client),
    } as never);

    const result = await service.emit({
      remittanceId,
      bankId: '001',
      remittanceNumber: 1,
      format: 'CNAB240',
    });

    expect(result.details).toHaveLength(2);
    expect(result.details.map((detail) => detail.account)).toEqual([
      '0001-1',
      '0002-2',
    ]);
    expect(
      result.details.every((detail) => detail.purposeCode === 'ALIM'),
    ).toBe(true);
    expect(
      queries.filter((entry) =>
        entry.sql.includes('INSERT INTO payroll.payment_remittance_detail'),
      ),
    ).toHaveLength(2);
  });
});

const tenantId = '00000000-0000-0000-0000-000000000100';
const remittanceId = '00000000-0000-4000-8000-000000000041';
const payrollRunId = '00000000-0000-4000-8000-000000000341';
const bankId = '00000000-0000-4000-8000-000000000001';
const employeeId = '00000000-0000-4000-8000-000000000002';
const alimonyAId = '00000000-0000-4000-8000-000000000101';
const alimonyBId = '00000000-0000-4000-8000-000000000102';

function alimonyRow(
  alimonyId: string,
  beneficiaryName: string,
  beneficiaryAccount: string,
  amount: string,
) {
  return {
    alimony_id: alimonyId,
    employee_id: employeeId,
    beneficiary_name: beneficiaryName,
    beneficiary_cpf: '12345678901',
    beneficiary_bank_code: 1,
    beneficiary_branch: '1234',
    beneficiary_account: beneficiaryAccount,
    amount,
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
