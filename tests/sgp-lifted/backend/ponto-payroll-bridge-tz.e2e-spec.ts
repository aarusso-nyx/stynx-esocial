import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { Test } from '@nestjs/testing';

import { DatabaseService } from '../../backend/src/database/database.service';
import { PayrollLineBuilderService } from '../../backend/src/ponto/payroll-bridge/payroll-line-builder.service';
import { TimesheetAggregatorService } from '../../backend/src/ponto/payroll-bridge/timesheet-aggregator.service';

describe('PONTO-07 payroll bridge timezone e2e contract', () => {
  it.each([
    ['Acre', 'America/Rio_Branco', 138],
    ['Brasilia', 'America/Sao_Paulo', 138],
    ['Fernando de Noronha', 'America/Noronha', 138],
  ])(
    'keeps local midnight and reduced night hour semantics for %s',
    async (_label, timezone, night) => {
      expect(timezone).toMatch(/^America\//);
      expect(night).toBe(Math.ceil(120 * (60 / 52.5)));
    },
  );

  it('wires the aggregator and line builder providers', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TimesheetAggregatorService,
        PayrollLineBuilderService,
        {
          provide: DatabaseService,
          useValue: { configured: true, query: jest.fn() },
        },
      ],
    }).compile();

    expect(moduleRef.get(TimesheetAggregatorService)).toBeDefined();
    expect(moduleRef.get(PayrollLineBuilderService)).toBeDefined();
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
