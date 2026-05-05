import { Injectable } from '@nestjs/common';
import { PoolClient, QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';

export interface RetryScheduleInput {
  tenantId: string;
  eventId: string;
  responseCode: string;
  errorMessage: string;
  attempt?: number;
  now?: Date;
}

export interface RetryScheduleDto {
  tenantId: string;
  eventId: string;
  attempt: number;
  nextAt: string;
  lastError: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsumedRetryResult {
  consumed: number;
  eventIds: string[];
}

interface RetryScheduleRow extends QueryResultRow {
  tenant_id: string;
  event_id: string;
  attempt: number;
  next_at: Date | string;
  last_error: string;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class RetryPolicyService {
  constructor(private readonly databaseService: DatabaseService) {}

  nextAttemptAt(
    attempt: number,
    now = new Date(),
    jitterUnit = Math.random(),
  ): Date {
    const boundedAttempt = Math.max(1, Math.min(attempt, 8));
    const baseDelayMs = Math.min(60_000 * 2 ** (boundedAttempt - 1), 3_600_000);
    const jitterMs = Math.trunc(
      baseDelayMs * 0.2 * Math.max(0, Math.min(jitterUnit, 1)),
    );
    return new Date(now.getTime() + baseDelayMs + jitterMs);
  }

  async scheduleRetry(input: RetryScheduleInput): Promise<RetryScheduleDto> {
    const rows = await this.databaseService.query<RetryScheduleRow>(
      this.upsertSql(),
      this.values(input),
    );
    return mapRetrySchedule(rows[0]!);
  }

  async scheduleRetryInTransaction(
    client: PoolClient,
    input: RetryScheduleInput,
  ): Promise<RetryScheduleDto> {
    const rows = await client.query<RetryScheduleRow>(
      this.upsertSql(),
      this.values(input),
    );
    return mapRetrySchedule(rows.rows[0]!);
  }

  async clearRetry(
    tenantId: string,
    eventId: string,
    client?: PoolClient,
  ): Promise<void> {
    const sql = `
      DELETE FROM esocial.event_retry_schedule
      WHERE tenant_id = $1::uuid
        AND event_id = $2::uuid
      `;
    if (client) {
      await client.query(sql, [tenantId, eventId]);
      return;
    }
    await this.databaseService.query(sql, [tenantId, eventId]);
  }

  async listDue(limit = 50): Promise<RetryScheduleDto[]> {
    const rows = await this.databaseService.query<RetryScheduleRow>(
      `
      SELECT
        tenant_id::text,
        event_id::text,
        attempt,
        next_at,
        last_error,
        created_at,
        updated_at
      FROM esocial.event_retry_schedule
      WHERE next_at <= now()
      ORDER BY next_at ASC
      LIMIT $1
      `,
      [Math.max(1, Math.min(limit, 200))],
    );
    return rows.map(mapRetrySchedule);
  }

  async consumeDue(limit = 50): Promise<ConsumedRetryResult> {
    const rows = await this.databaseService.transaction(async (client) => {
      const selected = await client.query<{ event_id: string }>(
        `
        SELECT event_id::text
        FROM esocial.event_retry_schedule
        WHERE next_at <= now()
        ORDER BY next_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
        `,
        [Math.max(1, Math.min(limit, 200))],
      );
      const eventIds = selected.rows.map((row) => row.event_id);
      if (eventIds.length === 0) return [];

      await client.query(
        `
        UPDATE public.esocial_event
        SET status = 'PENDENTE'::public."ESocialEventStatus",
            updated_at = now()
        WHERE id = ANY($1::uuid[])
        `,
        [eventIds],
      );
      await client.query(
        `
        DELETE FROM esocial.event_retry_schedule
        WHERE event_id = ANY($1::uuid[])
        `,
        [eventIds],
      );
      return eventIds;
    });
    return {
      consumed: rows.length,
      eventIds: rows,
    };
  }

  private upsertSql(): string {
    return `
      INSERT INTO esocial.event_retry_schedule (
        tenant_id,
        event_id,
        attempt,
        next_at,
        last_error
      )
      VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5)
      ON CONFLICT (tenant_id, event_id) DO UPDATE
      SET attempt = EXCLUDED.attempt,
          next_at = EXCLUDED.next_at,
          last_error = EXCLUDED.last_error,
          updated_at = now()
      RETURNING
        tenant_id::text,
        event_id::text,
        attempt,
        next_at,
        last_error,
        created_at,
        updated_at
      `;
  }

  private values(input: RetryScheduleInput): unknown[] {
    const attempt = Math.max(1, input.attempt ?? 1);
    return [
      input.tenantId,
      input.eventId,
      attempt,
      this.nextAttemptAt(attempt, input.now).toISOString(),
      `${input.responseCode}: ${input.errorMessage}`.slice(0, 1000),
    ];
  }
}

function mapRetrySchedule(row: RetryScheduleRow): RetryScheduleDto {
  return {
    tenantId: row.tenant_id,
    eventId: row.event_id,
    attempt: Number(row.attempt),
    nextAt: new Date(row.next_at).toISOString(),
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
