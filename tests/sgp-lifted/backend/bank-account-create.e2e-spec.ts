import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { Test } from '@nestjs/testing';

import { BankAccountService } from '../../backend/src/folha-pagamento/operations/bank-account/bank-account.service';
import { BankAccountValidatorService } from '../../backend/src/folha-pagamento/operations/bank-account/bank-account-validator.service';

describe('BANK-03 bank account create flow', () => {
  it('maps invalid verifier digits to the 422 validation code used by the API', () => {
    const validator = new BankAccountValidatorService();
    expect(
      validator.validate({
        bankCode: '001',
        agency: '0000',
        agencyDigit: '0',
        accountNumber: '00000000',
        accountDigit: '9',
        holderCpf: '52998224725',
      }),
    ).toEqual({ valid: false, validationErrorCode: 'ACCOUNT_DIGIT_INVALID' });
  });

  it('wires the validator and service into the Nest testing module', async () => {
    const module = await Test.createTestingModule({
      providers: [
        BankAccountValidatorService,
        {
          provide: BankAccountService,
          useFactory: (validator: BankAccountValidatorService) =>
            new BankAccountService({ configured: true } as never, validator),
          inject: [BankAccountValidatorService],
        },
      ],
    }).compile();
    expect(module.get(BankAccountService)).toBeDefined();
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
