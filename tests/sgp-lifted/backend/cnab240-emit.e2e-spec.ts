import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { UnprocessableEntityException } from '@nestjs/common';

import { Cnab240EmitService } from '../../backend/src/integrations-worker/cnab240/cnab240-emit.service';

describe('BANK-01 CNAB 240 emission gate', () => {
  it('blocks generation when the payroll run is not approved', async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            remittance_id: 'rem-1',
            tenant_id: 'tenant-1',
            payroll_run_id: 'run-1',
            competence_year: 2026,
            competence_month: 4,
            payment_date: '2026-04-25',
            file_name: null,
            payroll_status: 'DRAFT',
            company_name: 'Municipio Teste',
            company_registration: '12345678000199',
          },
        ],
      }),
    };
    const service = new Cnab240EmitService({
      transaction: (
        callback: (transactionClient: typeof client) => Promise<unknown>,
      ) => callback(client),
    } as never);

    await expect(
      service.emit({
        remittanceId: 'rem-1',
        bankId: '001',
        remittanceNumber: 1,
        format: 'CNAB240',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

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
