import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import {
  countRows,
  decideWorkerBackpressure,
  WorkerBackpressureDecision,
} from '../common/observability/worker-backpressure';
import { recordEsocialSubmission } from '../common/observability/prometheus.metrics';
import { RequestContextStore } from '../common/request-context/request-context.store';
import { DatabaseService } from '../database/database.service';
import { SubmissionService } from './submission/submission.service';
import { RetryPolicyService } from './sync/retry-policy.service';

interface StatusCountRow extends QueryResultRow {
  status: string;
  total: string;
}

export interface ESocialWorkerRunSummary {
  discovered: number;
  processed: number;
  failed: number;
  skipped: number;
}

@Injectable()
export class ESocialWorkerService {
  private readonly workerName = 'sgp-esocial-worker';

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly submissionService: SubmissionService,
    private readonly retryPolicyService: RetryPolicyService,
  ) {}

  health() {
    return {
      ok: true,
      service: 'sgp-esocial-worker',
      status: 'implemented',
      databaseConfigured: this.databaseService.configured,
      schemaVersion: 'S-1.3',
      dispatchAdapter: 'queue-adapter-esocial-relay',
      timestamp: new Date().toISOString(),
    };
  }

  async status() {
    const base = this.health();
    if (!this.databaseService.configured) {
      return {
        ...base,
        checks: {
          database: 'not_configured',
          eventsByStatus: {},
        },
      };
    }

    const rows = await this.runBypassingRls(() =>
      this.databaseService.query<StatusCountRow>(
        `
        SELECT status::text, count(*)::text AS total
        FROM public.esocial_event
        GROUP BY status
        ORDER BY status
        `,
      ),
    );

    return {
      ...base,
      checks: {
        database: 'configured',
        eventsByStatus: Object.fromEntries(
          rows.map((row) => [row.status, Number(row.total)]),
        ),
      },
    };
  }

  async pollOnce(limit = 10): Promise<ESocialWorkerRunSummary> {
    this.ensureDatabase();
    const retryLimit = this.normalizeLimit(limit);
    const dueRetries = await this.runBypassingRls(() =>
      this.retryPolicyService.consumeDue(retryLimit),
    );
    const result = await this.submissionService.submitPendingBatch(retryLimit);
    if (!result) {
      return {
        discovered: dueRetries.consumed,
        processed: 0,
        failed: 0,
        skipped: 0,
      };
    }
    recordEsocialSubmission(result.status, 'batch');
    const failed = result.status === 'ACCEPTED' ? 0 : result.eventCount;
    return {
      discovered: result.eventCount + dueRetries.consumed,
      processed: result.status === 'ACCEPTED' ? result.eventCount : 0,
      failed,
      skipped: 0,
    };
  }

  async backpressureStatus(limit = 10): Promise<WorkerBackpressureDecision> {
    this.ensureDatabase();
    const requestedLimit = this.normalizeLimit(limit);
    return this.runBypassingRls(() => this.backpressure(requestedLimit));
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit < 1) return 10;
    return Math.min(limit, 100);
  }

  private async backpressure(
    requestedLimit: number,
  ): Promise<ReturnType<typeof decideWorkerBackpressure>> {
    const [pendingEvents, dueRetries, activeClaims] = await Promise.all([
      countRows(
        (sql, values) => this.databaseService.query(sql, values),
        `
        SELECT count(*)::text AS total
        FROM public.esocial_event
        WHERE status = 'PENDENTE'::public."ESocialEventStatus"
          AND xml_payload IS NOT NULL
        `,
      ),
      countRows(
        (sql, values) => this.databaseService.query(sql, values),
        `
        SELECT count(*)::text AS total
        FROM esocial.event_retry_schedule
        WHERE next_at <= now()
        `,
      ),
      countRows(
        (sql, values) => this.databaseService.query(sql, values),
        `
        SELECT count(*)::text AS total
        FROM public.esocial_event
        WHERE status = 'ENVIANDO'::public."ESocialEventStatus"
        `,
      ),
    ]);
    return decideWorkerBackpressure(this.workerName, requestedLimit, {
      queueDepth: pendingEvents + dueRetries,
      activeClaims,
      capacity: requestedLimit,
    });
  }

  private ensureDatabase(): void {
    if (!this.databaseService.configured) {
      throw new ServiceUnavailableException(
        'DATABASE_URL is required for eSocial worker operations',
      );
    }
  }

  private runBypassingRls<T>(fn: () => Promise<T>): Promise<T> {
    return RequestContextStore.run(
      { bypassRls: true, bypassRlsReason: 'esocial-worker' },
      fn,
    );
  }
}
