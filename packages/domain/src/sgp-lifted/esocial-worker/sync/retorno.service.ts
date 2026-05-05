import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';

export interface EventFailureDto {
  tenantId: string;
  eventId: string;
  eventType: string;
  reference: string;
  competence: string;
  status: string;
  responseCode: string | null;
  translatedMessage: string | null;
  responseDescription: string | null;
  responseErrors: unknown[];
  lastResponseAt: string | null;
  retryCount: number;
  attempt: number | null;
  nextAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FailureRow extends QueryResultRow {
  tenant_id: string;
  event_id: string;
  event_type: string;
  reference: string;
  competence: string;
  status: string;
  response_code: string | null;
  translated_message: string | null;
  response_description: string | null;
  response_errors: unknown[] | string | null;
  last_response_at: Date | string | null;
  retry_count: number;
  attempt: number | null;
  next_at: Date | string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class RetornoService {
  constructor(private readonly databaseService: DatabaseService) {}

  async listFailures(status?: string): Promise<EventFailureDto[]> {
    const rows = await this.databaseService.query<FailureRow>(
      `
      SELECT
        tenant_id::text,
        event_id::text,
        event_type,
        reference,
        competence,
        status::text,
        response_code,
        translated_message,
        response_description,
        response_errors,
        last_response_at,
        retry_count,
        attempt,
        next_at,
        last_error,
        created_at,
        updated_at
      FROM esocial.v_event_failures
      WHERE ($1 = '' OR status::text = $1)
      ORDER BY
        CASE status::text
          WHEN 'ERRO_DEFINITIVO' THEN 0
          WHEN 'ERRO_TECNICO_RETENTAVEL' THEN 1
          ELSE 2
        END,
        COALESCE(next_at, last_response_at, updated_at) ASC
      LIMIT 200
      `,
      [status ?? ''],
    );
    return rows.map(mapFailure);
  }

  async eventDetail(eventId: string): Promise<EventFailureDto> {
    const rows = await this.databaseService.query<FailureRow>(
      `
      SELECT
        tenant_id::text,
        event_id::text,
        event_type,
        reference,
        competence,
        status::text,
        response_code,
        translated_message,
        response_description,
        response_errors,
        last_response_at,
        retry_count,
        attempt,
        next_at,
        last_error,
        created_at,
        updated_at
      FROM esocial.v_event_failures
      WHERE event_id = $1::uuid
      LIMIT 1
      `,
      [eventId],
    );
    if (!rows[0]) {
      throw new NotFoundException('eSocial return event not found');
    }
    return mapFailure(rows[0]);
  }

  async forceRetry(eventId: string): Promise<EventFailureDto> {
    await this.databaseService.query(
      `
      INSERT INTO esocial.event_retry_schedule (
        tenant_id,
        event_id,
        attempt,
        next_at,
        last_error
      )
      SELECT tenant_id, id, retry_count + 1, now(), COALESCE(last_error_message, response_description, '')
      FROM public.esocial_event
      WHERE id = $1::uuid
      ON CONFLICT (tenant_id, event_id) DO UPDATE
      SET attempt = esocial.event_retry_schedule.attempt + 1,
          next_at = now(),
          last_error = EXCLUDED.last_error,
          updated_at = now()
      `,
      [eventId],
    );
    return this.eventDetail(eventId);
  }

  async markHandled(eventId: string): Promise<EventFailureDto> {
    await this.databaseService.query(
      `
      UPDATE public.esocial_event
      SET status = 'AGUARDANDO_RETORNO'::public."ESocialEventStatus",
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = now()
      WHERE id = $1::uuid
      `,
      [eventId],
    );
    await this.databaseService.query(
      `
      DELETE FROM esocial.event_retry_schedule
      WHERE event_id = $1::uuid
      `,
      [eventId],
    );
    return this.eventDetail(eventId).catch(() => {
      throw new NotFoundException('eSocial return failure was marked handled');
    });
  }
}

function mapFailure(row: FailureRow): EventFailureDto {
  return {
    tenantId: row.tenant_id,
    eventId: row.event_id,
    eventType: row.event_type,
    reference: row.reference,
    competence: row.competence,
    status: row.status,
    responseCode: row.response_code,
    translatedMessage: row.translated_message,
    responseDescription: row.response_description,
    responseErrors: normalizeErrors(row.response_errors),
    lastResponseAt: row.last_response_at
      ? new Date(row.last_response_at).toISOString()
      : null,
    retryCount: Number(row.retry_count),
    attempt: row.attempt === null ? null : Number(row.attempt),
    nextAt: row.next_at ? new Date(row.next_at).toISOString() : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function normalizeErrors(value: unknown[] | string | null): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [value];
    }
  }
  return [value];
}
