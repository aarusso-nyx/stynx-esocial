import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { DutyRosterService } from '../../backend/src/ponto/duty-roster/duty-roster.service';

describe('PONTO roster publish flow (e2e)', () => {
  it('publishes and locks a generated roster through the service contract', async () => {
    const databaseService = {
      configured: true,
      transaction: jest.fn(
        async (callback: (client: unknown) => Promise<unknown>) =>
          callback({
            query: jest
              .fn()
              .mockResolvedValueOnce({
                rows: [
                  {
                    duty_roster_id: '00000000-0000-4000-8000-000000000064',
                    period_start: '2026-05-01',
                    period_end: '2026-05-31',
                    status: 'DRAFT',
                    published_at: null,
                  },
                ],
              })
              .mockResolvedValue({ rows: [] }),
          }),
      ),
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            duty_roster_id: '00000000-0000-4000-8000-000000000064',
            period_start: '2026-05-01',
            period_end: '2026-05-31',
            status: 'PUBLISHED',
            published_at: '2026-05-02T12:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([
          {
            duty_roster_id: '00000000-0000-4000-8000-000000000064',
            period_start: '2026-05-01',
            period_end: '2026-05-31',
            status: 'LOCKED',
            published_at: '2026-05-02T12:00:00.000Z',
          },
        ]),
    };
    const projector = {
      projectEmployee: jest.fn().mockResolvedValue([
        {
          employeeId: '00000000-0000-4000-8000-000000000061',
          workDate: '2026-05-01',
          expectedEntry: '2026-05-01T19:00:00-03:00',
          expectedExit: '2026-05-02T07:00:00-03:00',
          expectedMinutes: 720,
          nightShiftFlag: true,
          hazardFlag: false,
        },
      ]),
    };

    const service = new DutyRosterService(
      databaseService as never,
      projector as never,
    );
    const generated = await service.generate({
      employeeIds: ['00000000-0000-4000-8000-000000000061'],
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    });
    const published = await service.publish(generated.dutyRosterId);
    const locked = await service.lock(generated.dutyRosterId);

    expect(published.status).toBe('PUBLISHED');
    expect(locked.status).toBe('LOCKED');
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
