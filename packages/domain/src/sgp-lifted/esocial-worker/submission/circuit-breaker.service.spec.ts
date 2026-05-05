import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  it('opens after configured failures and blocks sends during cooldown', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ state: 'CLOSED' }])
      .mockResolvedValueOnce([{ state: 'OPEN' }])
      .mockResolvedValueOnce([
        {
          endpoint_url: 'http://127.0.0.1/esocial',
          opened_at: new Date(),
          last_failure_at: new Date(),
          failure_count: 3,
          state: 'OPEN',
        },
      ]);
    const service = new CircuitBreakerService(
      { query } as never,
      {
        get: (key: string) =>
          key === 'ESOCIAL_CIRCUIT_FAILURE_THRESHOLD' ? '3' : '60000',
      } as never,
    );

    await expect(
      service.recordFailure('http://127.0.0.1/esocial'),
    ).resolves.toBe('CLOSED');
    await expect(
      service.recordFailure('http://127.0.0.1/esocial'),
    ).resolves.toBe('OPEN');
    await expect(
      service.assertCanSend('http://127.0.0.1/esocial'),
    ).rejects.toThrow('circuit is open');
  });

  it('moves an open endpoint to half-open after cooldown', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          endpoint_url: 'http://127.0.0.1/esocial',
          opened_at: new Date('2026-05-02T10:00:00.000Z'),
          failure_count: 3,
          state: 'OPEN',
        },
      ])
      .mockResolvedValueOnce([]);
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-05-02T10:02:00.000Z').getTime());
    const service = new CircuitBreakerService(
      { query } as never,
      { get: () => '60000' } as never,
    );

    await expect(
      service.assertCanSend('http://127.0.0.1/esocial'),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("state = 'HALF_OPEN'"),
      ['http://127.0.0.1/esocial'],
    );
    now.mockRestore();
  });
});
