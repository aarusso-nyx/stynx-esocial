import { TceCircuitStateDto } from '../../backend/src/tce/queue/circuit-breaker.service';
import { TceRetryStrategyService } from '../../backend/src/tce/queue/retry-strategy.service';
import { TceQueueController } from '../../backend/src/tce/queue/tce-queue.controller';
import { TceWorkerService } from '../../backend/src/tce/queue/tce-worker.service';

describe('TCE-04 queue retry and admin controls (e2e)', () => {
  it('opens circuit after transient failures, exposes reset, and succeeds after replay', async () => {
    const database = new FakeQueueDatabase();
    const adapter = new FlakyAudespSubmissionService(3);
    const circuit = new FakeCircuitBreaker(3);
    const worker = new TceWorkerService(
      database as never,
      adapter as never,
      new TceRetryStrategyService(),
      circuit as never,
      { get: () => undefined } as never,
    );
    const controller = new TceQueueController(
      worker,
      circuit as never,
      { auditMutation: jest.fn() } as never,
    );

    await worker.runOnce(1);
    await worker.runOnce(1);
    await worker.runOnce(1);

    expect(database.job.status).toBe('RETRY');
    expect(database.job.next_attempt_at).toBeTruthy();
    expect((await controller.circuits())[0]).toMatchObject({
      adapterId: 'audesp-sp',
      state: 'OPEN',
      failureCount: 3,
    });

    await controller.resetCircuit(
      'audesp-sp',
      encodeURIComponent('stub://audesp-sp'),
      {} as never,
    );
    expect((await controller.circuits())[0].state).toBe('CLOSED');

    await worker.runOnce(1);
    expect(database.job.status).toBe('SUCCEEDED');
    expect(adapter.calls).toBe(4);
  });

  it('moves max-attempts exhaustion to dead letter', async () => {
    const database = new FakeQueueDatabase();
    database.job.attempts = 7;
    database.job.max_attempts = 8;
    const worker = new TceWorkerService(
      database as never,
      {
        submit: jest.fn().mockRejectedValue(new Error('transient unavailable')),
      } as never,
      new TceRetryStrategyService(),
      new FakeCircuitBreaker(3) as never,
      { get: () => undefined } as never,
    );

    await worker.runOnce(1);

    expect(database.job.status).toBe('DEAD_LETTER');
    expect(database.job.attempts).toBe(8);
  });
});

class FlakyAudespSubmissionService {
  calls = 0;

  constructor(private readonly failures: number) {}

  async submit(): Promise<void> {
    this.calls += 1;
    if (this.calls <= this.failures) {
      throw new Error('transient unavailable');
    }
  }
}

class FakeCircuitBreaker {
  private failureCount = 0;
  private state: 'CLOSED' | 'OPEN' = 'CLOSED';

  constructor(private readonly threshold: number) {}

  async assertCanSend(): Promise<void> {
    if (this.state === 'OPEN') throw new Error('circuit open');
  }

  async recordFailure(): Promise<'CLOSED' | 'OPEN'> {
    this.failureCount += 1;
    if (this.failureCount >= this.threshold) this.state = 'OPEN';
    return this.state;
  }

  async recordSuccess(): Promise<void> {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  async reset(): Promise<TceCircuitStateDto> {
    await this.recordSuccess();
    return this.toDto();
  }

  async list(): Promise<TceCircuitStateDto[]> {
    return [this.toDto()];
  }

  private toDto(): TceCircuitStateDto {
    return {
      adapterId: 'audesp-sp',
      endpointUrl: 'stub://audesp-sp',
      state: this.state,
      failureCount: this.failureCount,
      openedAt: this.state === 'OPEN' ? '2026-05-02T00:00:00.000Z' : null,
      lastFailureAt: this.failureCount ? '2026-05-02T00:00:00.000Z' : null,
      lastSuccessAt: null,
    };
  }
}

class FakeQueueDatabase {
  job = {
    id: '00000000-0000-4000-8000-000000000074',
    tenant_id: '00000000-0000-0000-0000-000000000100',
    submission_id: '00000000-0000-4000-8000-000000000075',
    adapter_id: 'audesp-sp',
    endpoint_url: 'stub://audesp-sp',
    attempts: 0,
    max_attempts: 8,
    status: 'PENDING',
    next_attempt_at: '2026-05-02T00:00:00.000Z',
  };

  async query<T>(sql: string): Promise<T[]> {
    if (
      sql.includes('UPDATE tce.submission_queue queue') &&
      sql.includes('claimed')
    ) {
      if (!['PENDING', 'RETRY'].includes(this.job.status)) return [] as T[];
      this.job.status = 'LOCKED';
      return [{ ...this.job }] as T[];
    }
    return [] as T[];
  }

  async transaction<T>(
    callback: (client: {
      query: (sql: string, values?: unknown[]) => Promise<unknown>;
    }) => Promise<T>,
  ) {
    return callback({
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes('UPDATE tce.submission_queue')) {
          if (sql.includes("status = 'SUCCEEDED'")) {
            this.job.status = 'SUCCEEDED';
            this.job.attempts += 1;
            this.job.next_attempt_at = '';
          } else {
            this.job.status = String(values[1]);
            this.job.attempts += 1;
            this.job.next_attempt_at =
              typeof values[2] === 'string' ? values[2] : '';
          }
        }
        return { rows: [] };
      },
    });
  }
}
