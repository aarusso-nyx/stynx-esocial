import { randomUUID } from 'node:crypto';

import {
  ESOCIAL_RELAY_EVENT_CLASSES,
} from '@esocial/contracts';
import type { EsocialStatus } from '@esocial/contracts';
import {
  loadReturnServiceConfig,
} from '@esocial/domain';
import type {
  PersistReturnCommand,
  ReturnOriginLookup,
  ReturnOriginRecord,
  ReturnPersistenceRecord,
  ReturnRepository,
  ReturnResponseClassification,
} from '@esocial/domain';
import pg from 'pg';
import type { Pool, PoolClient } from 'pg';


const { Pool: PgPool } = pg;

export type PostgresReturnRepositoryOptions = Readonly<{
  connectionString: string;
}>;

export type ClosableReturnRepository = ReturnRepository &
  Readonly<{
    close(): Promise<void>;
  }>;

export function createPostgresReturnRepositoryFromEnv(): ClosableReturnRepository {
  return createPostgresReturnRepository({
    connectionString: loadReturnServiceConfig().databaseUrl,
  });
}

export function createPostgresReturnRepository(
  options: PostgresReturnRepositoryOptions,
): ClosableReturnRepository {
  const pool = new PgPool({
    connectionString: options.connectionString,
  });

  return new PostgresReturnRepository(pool);
}

export class PostgresReturnRepository implements ReturnRepository {
  constructor(private readonly pool: Pool) {}

  async classifyResponseCode(input: Readonly<{
    environment: string;
    responseCode: string;
  }>): Promise<ReturnResponseClassification | undefined> {
    const result = await this.pool.query<{
      response_code: string;
      canonical_status: ReturnResponseClassification['canonicalStatus'];
      retryable: boolean;
      category: string;
      description: string;
      operator_action_required: boolean;
    }>(
      `
        SELECT
          response_code,
          canonical_status,
          retryable,
          category,
          description,
          operator_action_required
        FROM esocial.response_classification
        WHERE response_code = $1
          AND environment IN ($2, 'ANY')
        ORDER BY CASE WHEN environment = $2 THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [input.responseCode, input.environment],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      responseCode: row.response_code,
      canonicalStatus: row.canonical_status,
      retryable: row.retryable,
      category: row.category,
      description: row.description,
      operatorActionRequired: row.operator_action_required,
    };
  }

  async resolveOrigin(input: ReturnOriginLookup): Promise<ReturnOriginRecord | undefined> {
    const result = await this.pool.query<{
      event_record_id: string;
      batch_id: string | null;
      status: string;
      event_class: string;
      competence: string | null;
    }>(
      `
        SELECT
          er.event_record_id,
          COALESCE(er.batch_id, sb.batch_id) AS batch_id,
          er.status,
          er.event_class,
          er.competence
        FROM esocial.event_record er
        LEFT JOIN esocial.submission_batch sb
          ON sb.tenant_id = er.tenant_id
         AND sb.environment = er.environment
         AND (
           sb.batch_id = er.batch_id
           OR ($3::text IS NOT NULL AND sb.protocol_number = $3)
         )
        WHERE er.tenant_id = $1
          AND er.environment = $2
          AND (
            ($3::text IS NOT NULL AND er.protocol_number = $3)
            OR ($4::text IS NOT NULL AND er.receipt_number = $4)
            OR ($3::text IS NOT NULL AND sb.protocol_number = $3)
          )
        ORDER BY er.updated_at DESC, er.created_at DESC
        LIMIT 1
      `,
      [input.tenantId, input.environment, input.protocol ?? null, input.receipt ?? null],
    );
    const row = result.rows[0];
    if (!row || !row.batch_id) return undefined;

    return {
      eventRecordId: row.event_record_id,
      batchId: row.batch_id,
      previousStatus: statusFromDatabase(row.status),
      sourceEventClass: returnEventClass(row.event_class),
      competence: row.competence ?? undefined,
    };
  }

  async persist(command: PersistReturnCommand): Promise<ReturnPersistenceRecord> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        command.envelope.tenant_id,
      ]);

      const message = await persistReturnMessage(client, command);
      if (!message.inserted) {
        await client.query('COMMIT');
        return {
          inserted: false,
          messageId: message.messageId,
          eventRecordId: command.eventRecordId,
          batchId: command.batchId,
          status: message.status,
          previousStatus: command.previousStatus,
          responseHash: command.responseHash,
          protocol: command.protocol,
          receipt: command.receipt,
          totalizerClass: command.totalizerClass,
          competence: command.competence,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        };
      }

      await updateEventRecord(client, command);
      await appendStatusHistory(client, command);
      await appendAuditEvent(client, command, message.messageId);
      const totalizerId = command.totalizerClass
        ? await persistTotalizer(client, command)
        : undefined;

      await client.query('COMMIT');

      return {
        inserted: true,
        messageId: message.messageId,
        eventRecordId: command.eventRecordId,
        batchId: command.batchId,
        status: command.status,
        previousStatus: command.previousStatus,
        responseHash: command.responseHash,
        protocol: command.protocol,
        receipt: command.receipt,
        totalizerId,
        totalizerClass: command.totalizerClass,
        competence: command.competence,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
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

async function persistReturnMessage(
  client: PoolClient,
  command: PersistReturnCommand,
): Promise<{
  inserted: boolean;
  messageId: string;
  status: EsocialStatus;
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
      VALUES ($1, $2, 'retorno', $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING message_id, status, created_at, updated_at
    `,
    [
      messageId,
      command.envelope.tenant_id,
      command.totalizerClass ?? command.envelope.event_class,
      command.responseHash,
      JSON.stringify({
        envelope: command.envelope,
        parsed: command.parsed,
        classification: command.classification,
        audit_flags: command.auditFlags,
        raw_response_xml: command.rawResponseXml,
      }),
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
        AND kind = 'retorno'
        AND COALESCE(environment, 'UNSPECIFIED') = $2
        AND COALESCE(event_class, 'UNSPECIFIED') = $3
        AND COALESCE(idempotency_key, payload_hash) = $4
    `,
    [
      command.envelope.tenant_id,
      command.envelope.environment,
      command.totalizerClass ?? command.envelope.event_class,
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
        AND kind = 'retorno'
        AND COALESCE(environment, 'UNSPECIFIED') = $2
        AND COALESCE(event_class, 'UNSPECIFIED') = $3
        AND COALESCE(idempotency_key, payload_hash) = $4
      ORDER BY created_at
      LIMIT 1
    `,
    [
      command.envelope.tenant_id,
      command.envelope.environment,
      command.totalizerClass ?? command.envelope.event_class,
      command.envelope['idempotency-key'],
    ],
  );

  const row = existing.rows[0];
  if (!row) {
    throw new Error('Idempotent return message lookup failed after conflict.');
  }

  return {
    inserted: false,
    messageId: row.message_id,
    status: statusFromDatabase(row.status),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function updateEventRecord(
  client: PoolClient,
  command: PersistReturnCommand,
): Promise<void> {
  await client.query(
    `
      UPDATE esocial.event_record
      SET status = $3,
          batch_id = COALESCE(batch_id, $4),
          protocol_number = COALESCE($5, protocol_number),
          receipt_number = COALESCE($6, receipt_number),
          response_sha256 = $7,
          processed_at = $8::timestamptz,
          updated_at = now()
      WHERE tenant_id = $1
        AND event_record_id = $2
    `,
    [
      command.envelope.tenant_id,
      command.eventRecordId,
      statusToDatabase(command.status),
      command.batchId,
      command.protocol ?? null,
      command.receipt ?? null,
      command.responseHash,
      command.occurredAt,
    ],
  );
}

async function appendStatusHistory(
  client: PoolClient,
  command: PersistReturnCommand,
): Promise<void> {
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
      command.eventRecordId,
      command.batchId,
      command.previousStatus ? statusToDatabase(command.previousStatus) : null,
      statusToDatabase(command.status),
      command.parsed?.responseCode ?? command.errors[0]?.code ?? 'RETURN_PARSED',
      command.parsed?.responseDescription
        ?? command.errors.map((error) => error.message).join('; ')
        ?? null,
      command.responseHash,
    ],
  );
}

async function appendAuditEvent(
  client: PoolClient,
  command: PersistReturnCommand,
  messageId: string,
): Promise<void> {
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
      VALUES ($1, $2, $3, $4, $5, $6, 'system:esocial-retorno', $7::jsonb, $8)
    `,
    [
      command.envelope.tenant_id,
      command.envelope['correlation-id'],
      messageId,
      command.batchId,
      command.eventRecordId,
      command.totalizerClass ? 'return.totalizer.persisted' : `return.${command.status}`,
      JSON.stringify({
        request_id: command.envelope['request-id'],
        protocol_number: command.protocol,
        receipt_number: command.receipt,
        response_sha256: command.responseHash,
        parsed: command.parsed,
        classification: command.classification,
        errors: command.errors,
        audit_flags: command.auditFlags,
        raw_response_ref: `local://esocial.submission_message/${messageId}/payload.raw_response_xml`,
        raw_response_bytes: command.rawResponseXml.length,
      }),
      command.responseHash,
    ],
  );
}

async function persistTotalizer(
  client: PoolClient,
  command: PersistReturnCommand,
): Promise<string> {
  const totalizerId = randomUUID();
  const inserted = await client.query<{ totalizer_id: string }>(
    `
      INSERT INTO esocial.esocial_totalizer (
        totalizer_id,
        tenant_id,
        batch_id,
        event_record_id,
        environment,
        totalizer_class,
        source_event_class,
        competence,
        protocol_number,
        receipt_number,
        payload_hash,
        totals,
        processed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::timestamptz)
      ON CONFLICT DO NOTHING
      RETURNING totalizer_id
    `,
    [
      totalizerId,
      command.envelope.tenant_id,
      command.batchId,
      command.eventRecordId,
      command.envelope.environment,
      command.totalizerClass,
      command.sourceEventClass ?? command.envelope.event_class,
      command.competence ?? null,
      command.protocol ?? null,
      command.receipt ?? null,
      command.responseHash,
      JSON.stringify(
        command.parsed?.kind === 'totalizer'
          ? command.parsed.totalizer.payload
          : {},
      ),
      command.occurredAt,
    ],
  );

  if (inserted.rows[0]) return inserted.rows[0].totalizer_id;

  const existing = await client.query<{ totalizer_id: string }>(
    `
      SELECT totalizer_id
      FROM esocial.esocial_totalizer
      WHERE tenant_id = $1
        AND environment = $2
        AND totalizer_class = $3
        AND COALESCE(receipt_number, '') = $4
        AND payload_hash = $5
      ORDER BY created_at
      LIMIT 1
    `,
    [
      command.envelope.tenant_id,
      command.envelope.environment,
      command.totalizerClass,
      command.receipt ?? '',
      command.responseHash,
    ],
  );
  const row = existing.rows[0];
  if (!row) throw new Error('Idempotent totalizer lookup failed after conflict.');
  return row.totalizer_id;
}

function statusToDatabase(status: EsocialStatus): string {
  return status.toUpperCase();
}

function statusFromDatabase(status: string): EsocialStatus {
  const normalized = status.toLowerCase();
  const statuses: readonly EsocialStatus[] = [
    'pending',
    'building',
    'validation_failed',
    'signed',
    'sent',
    'accepted',
    'rejected',
    'retry',
    'timeout',
    'dlq',
    'excluded',
    'failed',
  ];
  return statuses.includes(normalized as EsocialStatus)
    ? normalized as EsocialStatus
    : 'failed';
}

function returnEventClass(value: string): ReturnOriginRecord['sourceEventClass'] {
  return ESOCIAL_RELAY_EVENT_CLASSES.includes(
    value as NonNullable<ReturnOriginRecord['sourceEventClass']>,
  )
    ? value as ReturnOriginRecord['sourceEventClass']
    : undefined;
}
