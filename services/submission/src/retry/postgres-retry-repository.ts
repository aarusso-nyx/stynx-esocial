import type { EsocialContractError } from '@esocial/contracts';
import {
  buildDlqItemPersistenceCommand,
  buildRetryScheduleCommand,
  loadSubmissionServiceConfig,
} from '@esocial/domain';
import type {
  DlqItemPersistenceCommand,
  RetrySchedulePersistenceCommand,
  RetrySchedulePollerRepository,
  RetryScheduleRecord,
  SubmissionRequestEnvelope,
  TerminalDlqPayload,
} from '@esocial/domain';
import pg from 'pg';
import type { Pool, PoolClient } from 'pg';

const { Pool: PgPool } = pg;

export type PostgresRetryRepositoryOptions = Readonly<{
  connectionString: string;
}>;

export type ClosableRetryRepository = RetrySchedulePollerRepository<SubmissionRequestEnvelope> &
  Readonly<{
    scheduleFailure(input: Readonly<{
      request: SubmissionRequestEnvelope;
      eventRecordId: string;
      batchId?: string | undefined;
      decision: Parameters<typeof buildRetryScheduleCommand>[0]['decision'];
      error: EsocialContractError;
    }>): Promise<RetrySchedulePersistenceCommand>;
    persistDlq(input: Readonly<{
      dlq: TerminalDlqPayload<SubmissionRequestEnvelope>;
      messageId?: string | undefined;
      batchId?: string | undefined;
      eventRecordId?: string | undefined;
    }>): Promise<DlqItemPersistenceCommand>;
    close(): Promise<void>;
  }>;

export function createPostgresRetryRepositoryFromEnv(): ClosableRetryRepository {
  return createPostgresRetryRepository({
    connectionString: loadSubmissionServiceConfig().databaseUrl,
  });
}

export function createPostgresRetryRepository(
  options: PostgresRetryRepositoryOptions,
): ClosableRetryRepository {
  return new PostgresRetryRepository(new PgPool({
    connectionString: options.connectionString,
  }));
}

export class PostgresRetryRepository implements ClosableRetryRepository {
  constructor(private readonly pool: Pool) {}

  async scheduleFailure(input: Readonly<{
    request: SubmissionRequestEnvelope;
    eventRecordId: string;
    batchId?: string | undefined;
    decision: Parameters<typeof buildRetryScheduleCommand>[0]['decision'];
    error: EsocialContractError;
  }>): Promise<RetrySchedulePersistenceCommand> {
    const command = buildRetryScheduleCommand(input);
    const client = await this.pool.connect();
    try {
      await setTenant(client, command.tenantId);
      await client.query(
        `
          INSERT INTO esocial.event_retry_schedule (
            tenant_id,
            event_record_id,
            batch_id,
            environment,
            event_class,
            next_attempt_at,
            attempt_count,
            max_attempts,
            budget_remaining,
            last_classification,
            last_error_code,
            last_error_message,
            status,
            attempt,
            classification,
            last_error
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, $11, $12, $13, $7, $10, $12)
          ON CONFLICT (tenant_id, event_record_id)
          WHERE status IN ('SCHEDULED', 'CLAIMED')
          DO UPDATE SET
            next_attempt_at = EXCLUDED.next_attempt_at,
            attempt_count = EXCLUDED.attempt_count,
            max_attempts = EXCLUDED.max_attempts,
            budget_remaining = EXCLUDED.budget_remaining,
            last_classification = EXCLUDED.last_classification,
            last_error_code = EXCLUDED.last_error_code,
            last_error_message = EXCLUDED.last_error_message,
            status = 'SCHEDULED',
            attempt = EXCLUDED.attempt,
            classification = EXCLUDED.classification,
            last_error = EXCLUDED.last_error
        `,
        [
          command.tenantId,
          command.eventRecordId,
          command.batchId ?? null,
          command.environment,
          command.eventClass,
          command.nextAttemptAt,
          command.attemptCount,
          command.maxAttempts,
          command.budgetRemaining,
          command.lastClassification,
          command.lastErrorCode ?? null,
          command.lastErrorMessage,
          command.status,
        ],
      );
      return command;
    } finally {
      client.release();
    }
  }

  async claimDue(input: Readonly<{ now: string; limit: number }>): Promise<readonly RetryScheduleRecord<SubmissionRequestEnvelope>[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<RetryScheduleRow>(
        `
          UPDATE esocial.event_retry_schedule retry
          SET status = 'CLAIMED'
          FROM (
            SELECT retry_schedule_id
            FROM esocial.event_retry_schedule
            WHERE status = 'SCHEDULED'
              AND next_attempt_at <= $1::timestamptz
            ORDER BY next_attempt_at, created_at
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          ) due
          WHERE retry.retry_schedule_id = due.retry_schedule_id
          RETURNING
            retry.retry_schedule_id::text,
            retry.tenant_id::text,
            retry.event_record_id::text,
            retry.batch_id::text,
            retry.environment,
            retry.event_class,
            retry.next_attempt_at,
            retry.attempt_count,
            retry.max_attempts,
            retry.budget_remaining,
            retry.last_classification,
            retry.last_error_code,
            retry.last_error_message,
            (
              SELECT message.payload
              FROM esocial.submission_batch batch
              JOIN esocial.submission_message message
                ON message.message_id = batch.message_id
              WHERE batch.batch_id = retry.batch_id
              LIMIT 1
            ) AS original_envelope
        `,
        [input.now, input.limit],
      );
      return result.rows.map(rowToRetryScheduleRecord);
    } finally {
      client.release();
    }
  }

  async markDispatched(input: Readonly<{ retryScheduleId: string; dispatchedAt: string; attempt: number }>): Promise<void> {
    await this.pool.query(
      `
        UPDATE esocial.event_retry_schedule
        SET status = 'COMPLETED',
            attempt_count = $2,
            attempt = $2,
            next_attempt_at = $3::timestamptz
        WHERE retry_schedule_id = $1
      `,
      [input.retryScheduleId, input.attempt, input.dispatchedAt],
    );
  }

  async defer(input: Readonly<{ retryScheduleId: string; nextAttemptAt: string; reason: string }>): Promise<void> {
    await this.pool.query(
      `
        UPDATE esocial.event_retry_schedule
        SET status = 'SCHEDULED',
            next_attempt_at = $2::timestamptz,
            last_error_message = $3,
            last_error = $3
        WHERE retry_schedule_id = $1
      `,
      [input.retryScheduleId, input.nextAttemptAt, input.reason],
    );
  }

  async moveToDlq(input: Readonly<{
    retryScheduleId: string;
    dlq: TerminalDlqPayload<SubmissionRequestEnvelope>;
    dlqItem: DlqItemPersistenceCommand;
  }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await setTenant(client, input.dlqItem.tenantId);
      await persistDlqItem(client, input.dlqItem);
      await client.query(
        `
          UPDATE esocial.event_retry_schedule
          SET status = 'EXHAUSTED',
              budget_remaining = 0
          WHERE retry_schedule_id = $1
        `,
        [input.retryScheduleId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async persistDlq(input: Readonly<{
    dlq: TerminalDlqPayload<SubmissionRequestEnvelope>;
    messageId?: string | undefined;
    batchId?: string | undefined;
    eventRecordId?: string | undefined;
  }>): Promise<DlqItemPersistenceCommand> {
    const command = buildDlqItemPersistenceCommand(input);
    const client = await this.pool.connect();
    try {
      await setTenant(client, command.tenantId);
      await persistDlqItem(client, command);
      return command;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

type RetryScheduleRow = Readonly<{
  retry_schedule_id: string;
  tenant_id: string;
  event_record_id: string | null;
  batch_id: string | null;
  environment: string;
  event_class: string;
  next_attempt_at: Date;
  attempt_count: number;
  max_attempts: number;
  budget_remaining: number;
  last_classification: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  original_envelope: SubmissionRequestEnvelope | null;
}>;

async function persistDlqItem(
  client: PoolClient,
  command: DlqItemPersistenceCommand,
): Promise<void> {
  await client.query(
    `
      INSERT INTO esocial.dlq_item (
        tenant_id,
        message_id,
        batch_id,
        event_record_id,
        environment,
        event_class,
        original_envelope,
        last_classification,
        attempt_history,
        hashes,
        replay_hint,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12)
    `,
    [
      command.tenantId,
      command.messageId ?? null,
      command.batchId ?? null,
      command.eventRecordId ?? null,
      command.environment,
      command.eventClass,
      JSON.stringify(command.originalEnvelope),
      JSON.stringify(command.lastClassification),
      JSON.stringify(command.attemptHistory),
      JSON.stringify(command.hashes),
      JSON.stringify(command.replayHint),
      command.status,
    ],
  );
}

async function setTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query('SELECT set_config($1, $2, true)', [
    'app.current_tenant_id',
    tenantId,
  ]);
}

function rowToRetryScheduleRecord(
  row: RetryScheduleRow,
): RetryScheduleRecord<SubmissionRequestEnvelope> {
  if (!row.original_envelope) {
    throw new Error(`Retry schedule ${row.retry_schedule_id} has no original submission envelope.`);
  }
  return {
    retryScheduleId: row.retry_schedule_id,
    tenantId: row.tenant_id,
    eventRecordId: row.event_record_id ?? undefined,
    batchId: row.batch_id ?? undefined,
    environment: row.environment,
    eventClass: row.event_class,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    budgetRemaining: row.budget_remaining,
    nextAttemptAt: row.next_attempt_at.toISOString(),
    lastClassification: row.last_classification as RetryScheduleRecord['lastClassification'] ?? 'transport',
    lastErrorCode: row.last_error_code ?? undefined,
    lastErrorMessage: row.last_error_message ?? 'Retry scheduled.',
    originalEnvelope: row.original_envelope,
  };
}
