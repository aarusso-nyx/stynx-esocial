import { randomUUID } from 'node:crypto';

import type {
  PersistSubmissionCommand,
  SubmissionPersistenceRecord,
  SubmissionRepository,
} from '@esocial/domain';
import pg from 'pg';
import type { Pool, PoolClient } from 'pg';


const { Pool: PgPool } = pg;

export type PostgresSubmissionRepositoryOptions = Readonly<{
  connectionString: string;
}>;

export type ClosableSubmissionRepository = SubmissionRepository &
  Readonly<{
    close(): Promise<void>;
  }>;

export function createPostgresSubmissionRepositoryFromEnv(): ClosableSubmissionRepository {
  const connectionString = process.env.ESOCIAL_DATABASE_URL;

  if (!connectionString) {
    throw new Error('ESOCIAL_DATABASE_URL is required for the submission handler.');
  }

  return createPostgresSubmissionRepository({ connectionString });
}

export function createPostgresSubmissionRepository(
  options: PostgresSubmissionRepositoryOptions,
): ClosableSubmissionRepository {
  const pool = new PgPool({
    connectionString: options.connectionString,
  });

  return new PostgresSubmissionRepository(pool);
}

export class PostgresSubmissionRepository implements SubmissionRepository {
  constructor(private readonly pool: Pool) {}

  async persist(command: PersistSubmissionCommand): Promise<SubmissionPersistenceRecord> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        command.envelope.tenant_id,
      ]);

      const message = await persistSubmissionMessage(client, command);
      const duplicated = !message.inserted;

      if (duplicated) {
        await client.query('COMMIT');
        return {
          inserted: false,
          messageId: message.messageId,
          status: message.status,
          route: command.route,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
          errors: command.errors,
        };
      }

      const batch = await persistSubmissionBatch(client, command, message.messageId);
      const event = await persistEventRecord(client, command, batch.batchId);

      await client.query(
        `
          INSERT INTO esocial.event_status_history (
            tenant_id,
            event_record_id,
            batch_id,
            from_status,
            to_status,
            reason_code,
            reason_message,
            payload_hash
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          command.envelope.tenant_id,
          event.eventRecordId,
          batch.batchId,
          'PENDING',
          statusToDatabase(command.status),
          command.status === 'validation_failed' ? 'VALIDATION_FAILED' : 'ROUTED_TO_BUILD',
          command.errors?.map((error) => error.message).join('; ') ?? command.route.stage,
          command.envelope.payload_hash,
        ],
      );

      await client.query(
        `
          INSERT INTO esocial.audit_event_log (
            tenant_id,
            correlation_id,
            message_id,
            batch_id,
            event_record_id,
            event_type,
            actor,
            payload,
            payload_hash
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        `,
        [
          command.envelope.tenant_id,
          command.envelope['correlation-id'],
          message.messageId,
          batch.batchId,
          event.eventRecordId,
          `submission.${command.status}`,
          'system:esocial-submission',
          JSON.stringify({
            route: command.route.name,
            stage: command.route.stage,
            request_id: command.envelope['request-id'],
            errors: command.errors ?? [],
          }),
          command.envelope.payload_hash,
        ],
      );

      await client.query('COMMIT');

      return {
        inserted: true,
        messageId: message.messageId,
        batchId: batch.batchId,
        eventRecordId: event.eventRecordId,
        status: command.status,
        route: command.route,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        errors: command.errors,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function persistSubmissionMessage(
  client: PoolClient,
  command: PersistSubmissionCommand,
): Promise<{
  inserted: boolean;
  messageId: string;
  status: 'building' | 'validation_failed';
  createdAt: string;
  updatedAt: string;
}> {
  const messageId = randomUUID();
  const inserted = await client.query<{
    message_id: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      INSERT INTO esocial.submission_message (
        message_id,
        tenant_id,
        kind,
        event_class,
        payload_hash,
        payload,
        status,
        attempt,
        request_id,
        correlation_id,
        idempotency_key,
        reply_to,
        dead_letter_topic,
        environment,
        source_ref
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING message_id, status, created_at, updated_at
    `,
    [
      messageId,
      command.envelope.tenant_id,
      command.envelope.kind,
      command.envelope.event_class,
      command.envelope.payload_hash,
      JSON.stringify(command.envelope),
      command.status,
      command.envelope.attempt,
      command.envelope['request-id'],
      command.envelope['correlation-id'],
      command.envelope['idempotency-key'],
      command.envelope['reply-to'],
      command.envelope['dead-letter-topic'],
      command.envelope.environment,
      JSON.stringify(command.envelope.source),
    ],
  );

  if (inserted.rows[0]) {
    return {
      inserted: true,
      messageId: inserted.rows[0].message_id,
      status: statusFromDatabase(inserted.rows[0].status),
      createdAt: inserted.rows[0].created_at.toISOString(),
      updatedAt: inserted.rows[0].updated_at.toISOString(),
    };
  }

  await client.query(
    `
      UPDATE esocial.submission_message
      SET last_seen_at = now()
      WHERE tenant_id = $1
        AND kind = $2
        AND COALESCE(environment, 'UNSPECIFIED') = $3
        AND COALESCE(event_class, 'UNSPECIFIED') = $4
        AND COALESCE(idempotency_key, payload_hash) = $5
    `,
    [
      command.envelope.tenant_id,
      command.envelope.kind,
      command.envelope.environment,
      command.envelope.event_class,
      command.envelope['idempotency-key'],
    ],
  );

  const existing = await client.query<{
    message_id: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      SELECT message_id, status, created_at, updated_at
      FROM esocial.submission_message
      WHERE tenant_id = $1
        AND kind = $2
        AND COALESCE(environment, 'UNSPECIFIED') = $3
        AND COALESCE(event_class, 'UNSPECIFIED') = $4
        AND COALESCE(idempotency_key, payload_hash) = $5
      ORDER BY created_at
      LIMIT 1
    `,
    [
      command.envelope.tenant_id,
      command.envelope.kind,
      command.envelope.environment,
      command.envelope.event_class,
      command.envelope['idempotency-key'],
    ],
  );

  const row = existing.rows[0];
  if (!row) {
    throw new Error('Idempotent submission_message lookup failed after conflict.');
  }

  return {
    inserted: false,
    messageId: row.message_id,
    status: statusFromDatabase(row.status),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function persistSubmissionBatch(
  client: PoolClient,
  command: PersistSubmissionCommand,
  messageId: string,
): Promise<{ batchId: string }> {
  const payload = recordOrEmpty(command.envelope.payload);
  const batchId = uuidOrRandom(payload.batchId);
  const eventIds = Array.isArray(payload.eventIds)
    ? payload.eventIds.filter(isUuid)
    : [];

  const inserted = await client.query<{ batch_id: string }>(
    `
      INSERT INTO esocial.submission_batch (
        batch_id,
        tenant_id,
        message_id,
        environment,
        event_class,
        source_ref,
        event_ids,
        payload_hash,
        status,
        attempt,
        max_attempts,
        endpoint_url,
        request_sha256,
        signed_payload_sha256
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::uuid[], $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT DO NOTHING
      RETURNING batch_id
    `,
    [
      batchId,
      command.envelope.tenant_id,
      messageId,
      command.envelope.environment,
      command.envelope.event_class,
      JSON.stringify(command.envelope.source),
      eventIds,
      command.envelope.payload_hash,
      statusToDatabase(command.status),
      command.envelope.attempt,
      command.envelope['max-attempts'],
      stringOrNull(payload.endpointUrl),
      command.envelope.payload_hash,
      signedPayloadSha256(payload),
    ],
  );

  if (inserted.rows[0]) {
    return { batchId: inserted.rows[0].batch_id };
  }

  const existing = await client.query<{ batch_id: string }>(
    `
      SELECT batch_id
      FROM esocial.submission_batch
      WHERE tenant_id = $1
        AND environment = $2
        AND event_class = $3
        AND payload_hash = $4
        AND leiaute_version = 'S-1.2'
      ORDER BY created_at
      LIMIT 1
    `,
    [
      command.envelope.tenant_id,
      command.envelope.environment,
      command.envelope.event_class,
      command.envelope.payload_hash,
    ],
  );

  const row = existing.rows[0];
  if (!row) {
    throw new Error('Idempotent submission_batch lookup failed after conflict.');
  }

  return { batchId: row.batch_id };
}

async function persistEventRecord(
  client: PoolClient,
  command: PersistSubmissionCommand,
  batchId: string,
): Promise<{ eventRecordId: string }> {
  const eventRecordId = randomUUID();
  const sourceEventId = uuidOrNull(command.envelope.source.source_event_id);
  const payrollRunId = uuidOrNull(command.envelope.source.payroll_run_id);
  const employeeId = uuidOrNull(command.envelope.source.employee_id);
  const sourceEntityId =
    command.envelope.source.source_entity_id ??
    command.envelope.source.source_entity_ids?.join(',') ??
    null;

  const inserted = await client.query<{ event_record_id: string }>(
    `
      INSERT INTO esocial.event_record (
        event_record_id,
        tenant_id,
        source_event_id,
        payroll_run_id,
        employee_id,
        event_class,
        payload_hash,
        status,
        environment,
        source_entity_id,
        competence,
        operation,
        batch_id,
        request_sha256,
        signed_payload_sha256,
        source_ref
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ORIGINAL', $12, $13, $14, $15::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING event_record_id
    `,
    [
      eventRecordId,
      command.envelope.tenant_id,
      sourceEventId,
      payrollRunId,
      employeeId,
      command.envelope.event_class,
      command.envelope.payload_hash,
      statusToDatabase(command.status),
      command.envelope.environment,
      sourceEntityId,
      competenceFromSource(command.envelope.source),
      batchId,
      command.envelope.payload_hash,
      signedPayloadSha256(command.envelope.payload),
      JSON.stringify(command.envelope.source),
    ],
  );

  if (inserted.rows[0]) {
    return { eventRecordId: inserted.rows[0].event_record_id };
  }

  const existing = await client.query<{ event_record_id: string }>(
    `
      SELECT event_record_id
      FROM esocial.event_record
      WHERE tenant_id = $1
        AND environment = $2
        AND event_class = $3
        AND COALESCE(source_event_id::text, source_entity_id, '') = $4
        AND COALESCE(competence, '') = $5
        AND payload_hash = $6
        AND operation = 'ORIGINAL'
        AND COALESCE(rectification_of, '') = ''
        AND COALESCE(exclusion_of, '') = ''
      ORDER BY created_at
      LIMIT 1
    `,
    [
      command.envelope.tenant_id,
      command.envelope.environment,
      command.envelope.event_class,
      sourceEventId ?? sourceEntityId ?? '',
      competenceFromSource(command.envelope.source) ?? '',
      command.envelope.payload_hash,
    ],
  );

  const row = existing.rows[0];
  if (!row) {
    throw new Error('Idempotent event_record lookup failed after conflict.');
  }

  return { eventRecordId: row.event_record_id };
}

function statusToDatabase(status: 'building' | 'validation_failed'): string {
  return status.toUpperCase();
}

function statusFromDatabase(status: string): 'building' | 'validation_failed' {
  const normalized = status.toLowerCase();

  if (normalized === 'building' || normalized === 'validation_failed') {
    return normalized;
  }

  return 'building';
}

function competenceFromSource(source: { payroll_run_id?: string | undefined }): string | null {
  const match = source.payroll_run_id?.match(/(\d{4}-\d{2})/u);
  return match?.[1] ?? null;
}

function uuidOrRandom(value: unknown): string {
  return isUuid(value) ? value : randomUUID();
}

function uuidOrNull(value?: string): string | null {
  return isUuid(value) ? value : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function signedPayloadSha256(payload: unknown): string | null {
  const signedEnvelope = recordOrEmpty(recordOrEmpty(payload).signedEnvelope);
  return stringOrNull(signedEnvelope.pkcs7Sha256);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
