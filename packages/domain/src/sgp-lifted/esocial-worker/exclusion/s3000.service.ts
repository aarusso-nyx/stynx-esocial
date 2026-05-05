import { BadRequestException, Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import { PisPasepService } from '../../folha-pagamento/pis-pasep/pis-pasep.service';
import {
  EmittedESocialEvent,
  ESocialEmitService,
} from '../esocial-emit.service';
import { S3000Builder } from '../builders/s3000.builder';
import { sha256 } from '../builders/s22xx-common';

export interface S3000EligibleEvent {
  id: string;
  eventKind: string;
  reference: string;
  competence: string;
  receipt: string;
  status: string;
  sourceEntityKind: string | null;
  sourceEntityId: string | null;
}

export interface S3000RequestStatus {
  requestId: string;
  targetEventId: string;
  targetEventKind: string;
  targetRecibo: string;
  requestedByUserId: string | null;
  justification: string;
  requestedAt: string;
  status: string;
  blockReason: string | null;
  emittedEventId: string | null;
  acceptedReceipt: string | null;
}

export interface S3000RequestResult extends S3000RequestStatus {
  emitted: boolean;
  xmlHash?: string;
  event?: EmittedESocialEvent;
}

interface EligibleEventRow extends QueryResultRow {
  id: string;
  event_type: string;
  reference: string;
  competence: string;
  receipt: string;
  status: string;
  source_entity_kind: string | null;
  source_entity_id: string | null;
}

interface RequestRow extends QueryResultRow {
  request_id: string;
  target_event_id: string;
  target_event_kind: string;
  target_recibo: string;
  requested_by_user_id: string | null;
  justification: string;
  requested_at: Date | string;
  status: string;
  block_reason: string | null;
  emitted_event_id: string | null;
  accepted_receipt: string | null;
}

@Injectable()
export class S3000Service {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emitService: ESocialEmitService,
    private readonly builder: S3000Builder,
    private readonly pisPasepService: PisPasepService,
  ) {}

  async eligibleEvents(): Promise<S3000EligibleEvent[]> {
    const tenantId = this.currentTenantId();
    const rows = await this.databaseService.query<EligibleEventRow>(
      `
      SELECT
        id::text,
        event_type,
        reference,
        competence,
        COALESCE(receipt_number, reference) AS receipt,
        status::text,
        source_entity_kind,
        source_entity_id
      FROM public.esocial_event event
      WHERE tenant_id = $1::uuid
        AND status = 'PROCESSADO_COM_SUCESSO'::public."ESocialEventStatus"
        AND event_type <> 'S-3000'
        AND COALESCE(receipt_number, reference) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM esocial.s3000_request request
          WHERE request.tenant_id = event.tenant_id
            AND request.target_event_id = event.id
            AND request.status IN ('PENDING', 'EMITTED', 'ACCEPTED')
        )
      ORDER BY processed_at DESC NULLS LAST, created_at DESC
      `,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      eventKind: row.event_type,
      reference: row.reference,
      competence: row.competence,
      receipt: row.receipt,
      status: row.status,
      sourceEntityKind: row.source_entity_kind,
      sourceEntityId: row.source_entity_id,
    }));
  }

  async requests(): Promise<S3000RequestStatus[]> {
    const tenantId = this.currentTenantId();
    const rows = await this.databaseService.query<RequestRow>(
      `
      SELECT
        request_id::text,
        target_event_id::text,
        target_event_kind,
        target_recibo,
        requested_by_user_id::text,
        justification,
        requested_at,
        status::text,
        block_reason,
        emitted_event_id::text,
        accepted_receipt
      FROM esocial.s3000_request
      WHERE tenant_id = $1::uuid
      ORDER BY requested_at DESC
      `,
      [tenantId],
    );
    return rows.map(mapRequestRow);
  }

  async requestAndEmit(
    targetEventId: string,
    justification: string,
    requestedByUserId?: string | null,
  ): Promise<S3000RequestResult> {
    if (justification.trim().length < 30) {
      throw new BadRequestException(
        'S-3000 exclusion justification must have at least 30 characters',
      );
    }

    const tenantId = this.currentTenantId();
    const inserted = await this.databaseService.query<RequestRow>(
      `
      INSERT INTO esocial.s3000_request (
        tenant_id,
        target_event_id,
        target_recibo,
        target_event_kind,
        requested_by_user_id,
        justification
      )
      SELECT
        event.tenant_id,
        event.id,
        COALESCE(event.receipt_number, event.reference),
        event.event_type,
        $3::uuid,
        $4
      FROM public.esocial_event event
      WHERE event.tenant_id = $1::uuid
        AND event.id = $2::uuid
      RETURNING
        request_id::text,
        target_event_id::text,
        target_event_kind,
        target_recibo,
        requested_by_user_id::text,
        justification,
        requested_at,
        status::text,
        block_reason,
        emitted_event_id::text,
        accepted_receipt
      `,
      [
        tenantId,
        targetEventId,
        requestedByUserId ?? null,
        justification.trim(),
      ],
    );
    const request = inserted[0];
    if (!request)
      throw new BadRequestException('Target eSocial event not found');
    if (request.status === 'BLOCKED') {
      return { ...mapRequestRow(request), emitted: false };
    }

    const record = await this.builder.buildRequest(
      tenantId,
      request.request_id,
    );
    const xmlHash = sha256(record.xml);
    const event = await this.emitService.emit({
      tenantId,
      eventKind: 'S-3000',
      xml: record.xml,
      reference: record.reference,
      competence: record.competence,
      sourceEntityKind: 'esocial.s3000_request',
      sourceEntityId: request.request_id,
      xmlHash,
      payload: record.payload,
    });

    const updated = await this.databaseService.query<RequestRow>(
      `
      UPDATE esocial.s3000_request
      SET status = 'EMITTED',
          emitted_event_id = $3::uuid,
          updated_at = now()
      WHERE tenant_id = $1::uuid
        AND request_id = $2::uuid
      RETURNING
        request_id::text,
        target_event_id::text,
        target_event_kind,
        target_recibo,
        requested_by_user_id::text,
        justification,
        requested_at,
        status::text,
        block_reason,
        emitted_event_id::text,
        accepted_receipt
      `,
      [tenantId, request.request_id, event.id],
    );
    return {
      ...mapRequestRow(updated[0]!),
      emitted: true,
      xmlHash,
      event,
    };
  }

  async accept(
    requestId: string,
    receipt: string,
  ): Promise<S3000RequestStatus> {
    const tenantId = this.currentTenantId();
    const rows = await this.databaseService.transaction(async (client) => {
      const updated = await client.query<RequestRow>(
        `
        UPDATE esocial.s3000_request
        SET status = 'ACCEPTED',
            accepted_receipt = $3,
            accepted_at = now(),
            updated_at = now()
        WHERE tenant_id = $1::uuid
          AND request_id = $2::uuid
          AND status = 'EMITTED'
        RETURNING
          request_id::text,
          target_event_id::text,
          target_event_kind,
          target_recibo,
          requested_by_user_id::text,
          justification,
          requested_at,
          status::text,
          block_reason,
          emitted_event_id::text,
          accepted_receipt
        `,
        [tenantId, requestId, receipt],
      );
      const row = updated.rows[0];
      if (!row) return [];
      await client.query(
        `
        UPDATE public.esocial_event
        SET status = 'EXCLUIDO'::public."ESocialEventStatus",
            updated_at = now(),
            payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
              's3000Exclusion',
              jsonb_build_object(
                'requestId', $2::text,
                'receipt', $3::text,
                'acceptedAt', to_jsonb(now())
              )
            )
        WHERE tenant_id = $1::uuid
          AND id = $4::uuid
        `,
        [tenantId, requestId, receipt, row.target_event_id],
      );
      return [row];
    });
    const row = rows[0];
    if (!row) throw new BadRequestException('S-3000 request is not emitted');
    await this.pisPasepService.handleS3000Applied(row.target_event_id);
    return mapRequestRow(row);
  }

  private currentTenantId(): string {
    const context = RequestContextStore.get();
    const tenantId = context?.actor?.tenantId ?? context?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context is required for S-3000 exclusion');
    }
    return tenantId;
  }
}

function mapRequestRow(row: RequestRow): S3000RequestStatus {
  return {
    requestId: row.request_id,
    targetEventId: row.target_event_id,
    targetEventKind: row.target_event_kind,
    targetRecibo: row.target_recibo,
    requestedByUserId: row.requested_by_user_id,
    justification: row.justification,
    requestedAt: new Date(row.requested_at).toISOString(),
    status: row.status,
    blockReason: row.block_reason,
    emittedEventId: row.emitted_event_id,
    acceptedReceipt: row.accepted_receipt,
  };
}
