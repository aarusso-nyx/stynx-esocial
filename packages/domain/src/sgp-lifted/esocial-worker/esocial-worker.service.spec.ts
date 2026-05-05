import { ESocialWorkerService } from './esocial-worker.service';

describe('ESocialWorkerService', () => {
  it('processes pending events through the queue-backed submission service', async () => {
    const submitPendingBatch = jest.fn().mockResolvedValue({
      batchId: '00000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000100',
      eventCount: 2,
      status: 'ACCEPTED',
      attempts: 1,
      endpointUrl: 'http://127.0.0.1/esocial',
    });
    const service = new ESocialWorkerService(
      { configured: true, query: jest.fn() } as never,
      { submitPendingBatch } as never,
      {
        consumeDue: jest.fn().mockResolvedValue({ consumed: 0, eventIds: [] }),
      } as never,
    );

    await expect(service.pollOnce(5)).resolves.toEqual({
      discovered: 2,
      processed: 2,
      failed: 0,
      skipped: 0,
    });
    expect(submitPendingBatch).toHaveBeenCalledWith(5);
  });

  it('reports backpressure from pending eSocial queue and active claims', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("status = 'PENDENTE'")) return [{ total: '7' }];
      if (sql.includes('FROM esocial.event_retry_schedule')) {
        return [{ total: '2' }];
      }
      if (sql.includes("status = 'ENVIANDO'")) return [{ total: '3' }];
      return [];
    });
    const service = new ESocialWorkerService(
      { configured: true, query } as never,
      { submitPendingBatch: jest.fn() } as never,
      { consumeDue: jest.fn() } as never,
    );

    await expect(service.backpressureStatus(10)).resolves.toMatchObject({
      queueDepth: 9,
      activeClaims: 3,
      capacity: 10,
      limit: 7,
      skipped: false,
    });
  });

  it('reports retryable queue submission failures as failed discovered work', async () => {
    const service = new ESocialWorkerService(
      { configured: true, query: jest.fn() } as never,
      {
        submitPendingBatch: jest.fn().mockResolvedValue({
          batchId: '00000000-0000-4000-8000-000000000002',
          tenantId: '00000000-0000-0000-0000-000000000100',
          eventCount: 1,
          status: 'RETRY',
          attempts: 1,
          endpointUrl: 'http://127.0.0.1/esocial',
        }),
      } as never,
      {
        consumeDue: jest.fn().mockResolvedValue({ consumed: 0, eventIds: [] }),
      } as never,
    );

    await expect(service.pollOnce(1)).resolves.toEqual({
      discovered: 1,
      processed: 0,
      failed: 1,
      skipped: 0,
    });
  });

  it('reports status, empty polls, bounded limits, and missing database config', async () => {
    await expect(
      new ESocialWorkerService(
        { configured: false } as never,
        { submitPendingBatch: jest.fn() } as never,
        { consumeDue: jest.fn() } as never,
      ).status(),
    ).resolves.toMatchObject({
      dispatchAdapter: 'queue-adapter-esocial-relay',
      checks: {
        database: 'not_configured',
        eventsByStatus: {},
      },
    });

    const query = jest
      .fn()
      .mockResolvedValue([{ status: 'PENDENTE', total: '2' }]);
    const submitPendingBatch = jest.fn().mockResolvedValue(null);
    const service = new ESocialWorkerService(
      { configured: true, query } as never,
      { submitPendingBatch } as never,
      {
        consumeDue: jest.fn().mockResolvedValue({ consumed: 0, eventIds: [] }),
      } as never,
    );

    await expect(service.status()).resolves.toMatchObject({
      checks: { database: 'configured', eventsByStatus: { PENDENTE: 2 } },
    });
    await expect(service.pollOnce(0)).resolves.toEqual({
      discovered: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
    });
    expect(submitPendingBatch).toHaveBeenCalledWith(10);

    await expect(
      new ESocialWorkerService(
        { configured: false } as never,
        { submitPendingBatch: jest.fn() } as never,
        { consumeDue: jest.fn() } as never,
      ).pollOnce(),
    ).rejects.toThrow('DATABASE_URL is required');
  });
});
