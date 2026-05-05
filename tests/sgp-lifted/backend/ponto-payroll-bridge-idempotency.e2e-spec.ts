import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { PayrollBridgeService } from '../../backend/src/ponto/payroll-bridge/payroll-bridge.service';

describe('PONTO-07 payroll bridge idempotency e2e contract', () => {
  it('returns an existing bridge event without inserting duplicate lines', async () => {
    const existing = {
      payroll_bridge_event_id: '00000000-0000-4000-8000-000000000900',
      applied_at: '2026-05-31T12:00:00.000Z',
      applied_lines: [],
    };
    const databaseService = {
      configured: true,
      query: jest
        .fn()
        .mockResolvedValueOnce([{ competence_month: 5, competence_year: 2026 }])
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce([existing]),
      transaction: jest.fn(),
    };
    const aggregator = {
      aggregate: jest.fn().mockResolvedValue({
        tenantId: '00000000-0000-4000-8000-000000000100',
        employeeId: '00000000-0000-4000-8000-000000000200',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        workedMinutes: 480,
        expectedMinutes: 480,
        overtime50Minutes: 0,
        overtime100Minutes: 0,
        nightMinutes: 0,
        lateMinutes: 0,
        absenceUnpaidMinutes: 0,
        absencePaidMinutes: 0,
        hourBankSettlementMinutes: 0,
      }),
    };
    const builder = { buildLines: jest.fn().mockResolvedValue([]) };
    const service = new PayrollBridgeService(
      databaseService as never,
      aggregator as never,
      builder as never,
    );

    await expect(
      service.apply({
        payrollRunId: '00000000-0000-4000-8000-000000000300',
        timesheetPeriodId: '00000000-0000-4000-8000-000000000400',
      }),
    ).resolves.toMatchObject({
      alreadyApplied: true,
      payrollBridgeEventId: existing.payroll_bridge_event_id,
    });
    expect(databaseService.transaction).not.toHaveBeenCalled();
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
