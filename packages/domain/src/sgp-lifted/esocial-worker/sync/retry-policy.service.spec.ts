import { RetryPolicyService } from './retry-policy.service';

describe('RetryPolicyService', () => {
  it('computes exponential backoff with bounded jitter', () => {
    const service = new RetryPolicyService({} as never);
    const now = new Date('2026-05-02T12:00:00.000Z');

    expect(service.nextAttemptAt(1, now, 0).toISOString()).toBe(
      '2026-05-02T12:01:00.000Z',
    );
    expect(service.nextAttemptAt(3, now, 0.5).toISOString()).toBe(
      '2026-05-02T12:04:24.000Z',
    );
  });

  it('schedules recoverable returns and consumes due rows', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        tenant_id: '00000000-0000-0000-0000-000000003809',
        event_id: '00000000-0000-4000-8000-000000003810',
        attempt: 2,
        next_at: '2026-05-02T12:02:00.000Z',
        last_error: '301: Erro servidor.',
        created_at: '2026-05-02T12:00:00.000Z',
        updated_at: '2026-05-02T12:00:00.000Z',
      },
    ]);
    const transaction = jest.fn(
      async (callback: (client: unknown) => unknown) =>
        callback({
          query: jest
            .fn()
            .mockResolvedValueOnce({
              rows: [{ event_id: '00000000-0000-4000-8000-000000003810' }],
            })
            .mockResolvedValue({ rows: [] }),
        }),
    );
    const service = new RetryPolicyService({ query, transaction } as never);

    await expect(
      service.scheduleRetry({
        tenantId: '00000000-0000-0000-0000-000000003809',
        eventId: '00000000-0000-4000-8000-000000003810',
        responseCode: '301',
        errorMessage: 'Erro servidor.',
        attempt: 2,
        now: new Date('2026-05-02T12:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      attempt: 2,
      lastError: '301: Erro servidor.',
    });

    await expect(service.consumeDue(10)).resolves.toEqual({
      consumed: 1,
      eventIds: ['00000000-0000-4000-8000-000000003810'],
    });
  });
});
