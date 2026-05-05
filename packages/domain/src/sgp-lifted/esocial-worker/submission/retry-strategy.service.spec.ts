import { RetryStrategyService } from './retry-strategy.service';

describe('RetryStrategyService', () => {
  const service = new RetryStrategyService();

  it('classifies timeout, HTTP 500, processamento fault, and definitive faults', () => {
    expect(service.classify({ code: 'ETIMEDOUT' })).toMatchObject({
      transient: true,
      status: 'TIMEOUT',
      countsForCircuit: true,
    });
    expect(
      service.classify({
        message: 'Request failed',
        response: { status: 500, data: '<fault>internal</fault>' },
      }),
    ).toMatchObject({
      transient: true,
      status: 'RETRY',
      httpStatus: 500,
    });
    expect(
      service.classify({
        message: 'Fault de processamento temporario no Ambiente Nacional',
        response: { status: 200 },
      }),
    ).toMatchObject({
      transient: true,
      status: 'RETRY',
    });
    expect(
      service.classify({
        message: 'Schema do evento invalido',
        response: { status: 400 },
      }),
    ).toMatchObject({
      transient: false,
      status: 'REJECTED',
      countsForCircuit: false,
    });
  });

  it('computes exponential delay with bounded jitter', () => {
    const now = new Date('2026-05-02T12:00:00.000Z');

    expect(service.nextAttemptAt(1, now, 0).toISOString()).toBe(
      '2026-05-02T12:00:01.000Z',
    );
    expect(service.nextAttemptAt(3, now, 0.5).toISOString()).toBe(
      '2026-05-02T12:00:04.400Z',
    );
  });
});
