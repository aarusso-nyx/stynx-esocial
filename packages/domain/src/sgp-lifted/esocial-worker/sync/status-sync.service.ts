import { BadRequestException, Injectable } from '@nestjs/common';
import { PoolClient, QueryResultRow } from 'pg';

import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import {
  BatchProcessingReturn,
  EventProcessingReturn,
} from '../parsers/processing.parser';
import {
  OFFICIAL_RESPONSE_CLASSIFICATION_BY_CODE,
  ResponseClass,
} from '../parsers/response-classification';
import { RetryPolicyService } from './retry-policy.service';

export interface StatusSyncResult {
  batchResponseCode: string;
  events: Array<{
    eventId: string;
    eventReference: string;
    responseCode: string;
    class: ResponseClass;
    status: string;
    retryScheduled: boolean;
  }>;
}

interface EventRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  retry_count: number;
}

interface ClassificationRow extends QueryResultRow {
  class: ResponseClass;
  description: string;
}

const WORKER_PERMISSIONS = [
  'esocial.event.read',
  'esocial.event.write',
  'esocial.event.retry',
] as const;

@Injectable()
export class StatusSyncService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly retryPolicy: RetryPolicyService,
  ) {}

  async synchronize(
    tenantId: string,
    parsed: BatchProcessingReturn,
  ): Promise<StatusSyncResult> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: [...WORKER_PERMISSIONS],
        bypassRls: true,
        bypassRlsReason: 'esocial-worker',
      },
      () =>
        this.databaseService.transaction((client) =>
          this.synchronizeInTransaction(client, tenantId, parsed),
        ),
    );
  }

  async synchronizeInTransaction(
    client: PoolClient,
    tenantId: string,
    parsed: BatchProcessingReturn,
  ): Promise<StatusSyncResult> {
    const eventResults: StatusSyncResult['events'] = [];
    for (const event of parsed.events) {
      const synced = await this.synchronizeEvent(
        client,
        tenantId,
        parsed,
        event,
      );
      eventResults.push(synced);
    }
    return {
      batchResponseCode: parsed.responseCode,
      events: eventResults,
    };
  }

  private async synchronizeEvent(
    client: PoolClient,
    tenantId: string,
    batch: BatchProcessingReturn,
    eventReturn: EventProcessingReturn,
  ): Promise<StatusSyncResult['events'][number]> {
    const event = await this.resolveEvent(client, tenantId, eventReturn);
    const classification = await this.classification(
      client,
      eventReturn.responseCode,
    );
    const status = this.statusFor(classification.class);
    const firstError =
      eventReturn.errors.find((error) => error.type === 'ERROR') ??
      eventReturn.errors[0];
    const responseDescription =
      eventReturn.responseDescription || classification.description;
    const errorMessage = firstError?.description ?? responseDescription;

    await client.query(
      `
      UPDATE public.esocial_event
      SET status = $3::public."ESocialEventStatus",
          receipt_number = COALESCE($4, receipt_number),
          protocol_number = COALESCE($5, protocol_number),
          response_code = $6,
          response_description = $7,
          response_errors = $8::jsonb,
          last_response_at = COALESCE($9::timestamptz, now()),
          last_error_code = CASE
            WHEN $10::esocial.response_classification_class = 'ACCEPTED' THEN NULL
            ELSE $6
          END,
          last_error_message = CASE
            WHEN $10::esocial.response_classification_class = 'ACCEPTED' THEN NULL
            ELSE $11
          END,
          retry_count = CASE
            WHEN $10::esocial.response_classification_class = 'RECOVERABLE' THEN retry_count + 1
            ELSE retry_count
          END,
          processed_at = CASE
            WHEN $10::esocial.response_classification_class = 'ACCEPTED'
              THEN COALESCE($9::timestamptz, now())
            ELSE processed_at
          END,
          updated_at = now()
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      `,
      [
        tenantId,
        event.id,
        status,
        eventReturn.receipt,
        batch.protocol,
        eventReturn.responseCode,
        responseDescription,
        JSON.stringify(eventReturn.errors),
        eventReturn.processedAt ?? batch.processedAt,
        classification.class,
        errorMessage,
      ],
    );

    let retryScheduled = false;
    if (classification.class === 'RECOVERABLE') {
      await this.retryPolicy.scheduleRetryInTransaction(client, {
        tenantId,
        eventId: event.id,
        responseCode: eventReturn.responseCode,
        errorMessage,
        attempt: event.retry_count + 1,
      });
      retryScheduled = true;
    } else {
      await this.retryPolicy.clearRetry(tenantId, event.id, client);
    }

    return {
      eventId: event.id,
      eventReference: eventReturn.eventReference,
      responseCode: eventReturn.responseCode,
      class: classification.class,
      status,
      retryScheduled,
    };
  }

  private async resolveEvent(
    client: PoolClient,
    tenantId: string,
    eventReturn: EventProcessingReturn,
  ): Promise<EventRow> {
    const eventUuid = uuidOrNull(eventReturn.eventReference);
    const rows = await client.query<EventRow>(
      `
      SELECT id::text, tenant_id::text, retry_count
      FROM public.esocial_event
      WHERE tenant_id = $1::uuid
        AND (
          ($2::uuid IS NOT NULL AND id = $2::uuid)
          OR reference = $3
        )
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [tenantId, eventUuid, eventReturn.eventReference],
    );
    const event = rows.rows[0];
    if (!event) {
      throw new BadRequestException(
        `No eSocial event found for return Id ${eventReturn.eventReference}`,
      );
    }
    return event;
  }

  private async classification(
    client: PoolClient,
    responseCode: string,
  ): Promise<{ class: ResponseClass; description: string }> {
    const rows = await client.query<ClassificationRow>(
      `
      SELECT class::text AS class, description
      FROM esocial.response_classification
      WHERE response_code = $1
      `,
      [responseCode],
    );
    const row = rows.rows[0];
    if (row) return row;
    const fallback = OFFICIAL_RESPONSE_CLASSIFICATION_BY_CODE.get(responseCode);
    if (fallback) {
      return { class: fallback.class, description: fallback.description };
    }
    return {
      class: responseCode.startsWith('2') ? 'ACCEPTED' : 'DEFINITIVE',
      description: 'Unmapped eSocial response code',
    };
  }

  private statusFor(responseClass: ResponseClass): string {
    if (responseClass === 'ACCEPTED') return 'PROCESSADO_COM_SUCESSO';
    if (responseClass === 'RECOVERABLE') return 'ERRO_TECNICO_RETENTAVEL';
    return 'ERRO_DEFINITIVO';
  }
}

function uuidOrNull(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}
