import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as libxml from 'libxmljs2';
import { PoolClient, QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';

export type SubmissionEnvironment = 'PRODUCTION' | 'QUALIFICATION';
export type SubmissionBatchStatus =
  | 'PENDING'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'TIMEOUT'
  | 'RETRY';

export interface SubmissionBatchWorkItem {
  tenantId: string;
  batchId: string;
  environment: SubmissionEnvironment;
  endpointUrl: string;
  eventIds: string[];
  eventTypes: string[];
  eventXmlPayloads: string[];
  attempts: number;
  batchXml: string;
}

interface BatchRow extends QueryResultRow {
  tenant_id: string;
  batch_id: string;
  environment: SubmissionEnvironment;
  endpoint_url: string;
  event_ids: string[];
  attempts: number;
}

export interface SubmissionEventRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  event_type: string;
  reference: string;
  competence: string;
  xml_payload: string;
}

interface EmployerIdentity {
  type: string;
  registration: string;
}

const TABLE_EVENTS = new Set([
  'S-1000',
  'S-1005',
  'S-1010',
  'S-1020',
  'S-1030',
  'S-1035',
  'S-1040',
  'S-1050',
  'S-1060',
  'S-1070',
  'S-1080',
]);
const PERIODIC_EVENTS = new Set([
  'S-1200',
  'S-1202',
  'S-1207',
  'S-1210',
  'S-1260',
  'S-1270',
  'S-1280',
  'S-1298',
  'S-1299',
  'S-1300',
]);

@Injectable()
export class BatchBuilderService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async nextBatch(limit?: number): Promise<SubmissionBatchWorkItem | null> {
    const environment = this.environment();
    const endpointUrl = this.endpointUrl();
    const batchLimit = this.batchLimit(environment, limit);

    return this.databaseService.transaction(async (client) => {
      const existing = await this.lockExistingBatch(client);
      if (existing) {
        const events = await this.eventsForBatch(client, existing);
        return this.toWorkItem(existing, events);
      }

      const events = await this.lockPendingEvents(client, batchLimit);
      if (events.length === 0) return null;
      const firstEvent = events[0]!;
      const inserted = await client.query<BatchRow>(
        `
        INSERT INTO esocial.submission_batch (
          tenant_id,
          environment,
          endpoint_url,
          event_ids,
          status
        )
        VALUES (
          $1::uuid,
          $2::esocial.submission_environment,
          $3,
          $4::uuid[],
          'PENDING'::esocial.submission_batch_status
        )
        RETURNING
          tenant_id::text,
          batch_id::text,
          environment::text AS environment,
          endpoint_url,
          event_ids::text[],
          attempts
        `,
        [
          firstEvent.tenant_id,
          environment,
          endpointUrl,
          events.map((event) => event.id),
        ],
      );
      await client.query(
        `
        UPDATE public.esocial_event
        SET status = 'ENVIANDO'::public."ESocialEventStatus",
            updated_at = now()
        WHERE tenant_id = $1::uuid
          AND id = ANY($2::uuid[])
        `,
        [firstEvent.tenant_id, events.map((event) => event.id)],
      );
      return this.toWorkItem(inserted.rows[0]!, events);
    });
  }

  buildBatchXml(events: SubmissionEventRow[]): string {
    if (events.length === 0) {
      throw new BadRequestException('At least one eSocial event is required');
    }
    const employer = this.extractEmployer(events[0]!.xml_payload);
    const transmitter = this.transmitterIdentity(employer);
    const eventGroup = this.eventGroup(events);
    const eventXml = events
      .map((event) => {
        this.assertEventReady(event);
        return [
          `<evento Id="${escapeXml(event.reference || event.id)}">`,
          stripXmlDeclaration(event.xml_payload),
          '</evento>',
        ].join('');
      })
      .join('');

    return [
      '<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_0">',
      `<envioLoteEventos grupo="${eventGroup}">`,
      '<ideEmpregador>',
      `<tpInsc>${escapeXml(employer.type)}</tpInsc>`,
      `<nrInsc>${escapeXml(employer.registration)}</nrInsc>`,
      '</ideEmpregador>',
      '<ideTransmissor>',
      `<tpInsc>${escapeXml(transmitter.type)}</tpInsc>`,
      `<nrInsc>${escapeXml(transmitter.registration)}</nrInsc>`,
      '</ideTransmissor>',
      '<eventos>',
      eventXml,
      '</eventos>',
      '</envioLoteEventos>',
      '</eSocial>',
    ].join('');
  }

  private async lockExistingBatch(
    client: PoolClient,
  ): Promise<BatchRow | null> {
    const existing = await client.query<BatchRow>(
      `
      SELECT
        tenant_id::text,
        batch_id::text,
        environment::text AS environment,
        endpoint_url,
        event_ids::text[],
        attempts
      FROM esocial.submission_batch batch
      WHERE status IN (
          'PENDING'::esocial.submission_batch_status,
          'RETRY'::esocial.submission_batch_status,
          'TIMEOUT'::esocial.submission_batch_status
        )
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        AND cardinality(event_ids) = (
          SELECT count(*)::int
          FROM public.esocial_event event
          WHERE event.tenant_id = batch.tenant_id
            AND event.id = ANY(batch.event_ids)
        )
      ORDER BY next_attempt_at NULLS FIRST, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
      `,
    );
    return existing.rows[0] ?? null;
  }

  private async eventsForBatch(
    client: PoolClient,
    batch: BatchRow,
  ): Promise<SubmissionEventRow[]> {
    const events = await client.query<SubmissionEventRow>(
      `
      SELECT
        id::text,
        tenant_id::text,
        event_type,
        reference,
        competence,
        xml_payload
      FROM public.esocial_event
      WHERE tenant_id = $1::uuid
        AND id = ANY($2::uuid[])
      ORDER BY array_position($2::uuid[], id)
      `,
      [batch.tenant_id, batch.event_ids],
    );
    if (events.rows.length !== batch.event_ids.length) {
      throw new BadRequestException(
        'Submission batch references missing eSocial events',
      );
    }
    return events.rows;
  }

  private async lockPendingEvents(
    client: PoolClient,
    limit: number,
  ): Promise<SubmissionEventRow[]> {
    const events = await client.query<SubmissionEventRow>(
      `
      WITH first_tenant AS (
        SELECT tenant_id
        FROM public.esocial_event
        WHERE status = 'PENDENTE'::public."ESocialEventStatus"
          AND xml_payload IS NOT NULL
        ORDER BY created_at ASC
        LIMIT 1
      )
      SELECT
        event.id::text,
        event.tenant_id::text,
        event.event_type,
        event.reference,
        event.competence,
        event.xml_payload
      FROM public.esocial_event event
      JOIN first_tenant ON first_tenant.tenant_id = event.tenant_id
      WHERE event.status = 'PENDENTE'::public."ESocialEventStatus"
        AND event.xml_payload IS NOT NULL
      ORDER BY event.created_at ASC
      LIMIT $1
      FOR UPDATE OF event SKIP LOCKED
      `,
      [limit],
    );
    return events.rows;
  }

  private toWorkItem(
    batch: BatchRow,
    events: SubmissionEventRow[],
  ): SubmissionBatchWorkItem {
    return {
      tenantId: batch.tenant_id,
      batchId: batch.batch_id,
      environment: batch.environment,
      endpointUrl: batch.endpoint_url,
      eventIds: batch.event_ids,
      eventTypes: events.map((event) => event.event_type),
      eventXmlPayloads: events.map((event) => event.xml_payload),
      attempts: batch.attempts,
      batchXml: this.buildBatchXml(events),
    };
  }

  private extractEmployer(xml: string): EmployerIdentity {
    const document = libxml.parseXml(xml);
    const typeNode = document.get(
      "//*[local-name()='ideEmpregador']/*[local-name()='tpInsc']",
    ) as { text(): string } | null;
    const registrationNode = document.get(
      "//*[local-name()='ideEmpregador']/*[local-name()='nrInsc']",
    ) as { text(): string } | null;
    const type = typeNode?.text().trim();
    const registration = registrationNode?.text().trim();
    if (!type || !registration) {
      throw new BadRequestException(
        'Signed eSocial event XML must include ideEmpregador',
      );
    }
    return { type, registration };
  }

  private transmitterIdentity(employer: EmployerIdentity): EmployerIdentity {
    return {
      type:
        this.configService.get<string>('ESOCIAL_TRANSMITTER_TP_INSC') ??
        employer.type,
      registration:
        this.configService.get<string>('ESOCIAL_TRANSMITTER_NR_INSC') ??
        employer.registration,
    };
  }

  private eventGroup(events: SubmissionEventRow[]): string {
    if (events.every((event) => TABLE_EVENTS.has(event.event_type))) return '1';
    if (events.every((event) => PERIODIC_EVENTS.has(event.event_type)))
      return '3';
    return '2';
  }

  private assertEventReady(event: SubmissionEventRow): void {
    if (!/^S-[0-9]{4}$/.test(event.event_type)) {
      throw new BadRequestException('eSocial event_type must follow S-9999');
    }
    if (!event.xml_payload.trim()) {
      throw new BadRequestException('Signed eSocial XML payload is required');
    }
  }

  private environment(): SubmissionEnvironment {
    const value = (
      this.configService.get<string>('ESOCIAL_ENV') ?? 'QUALIFICATION'
    ).toUpperCase();
    if (value !== 'PRODUCTION' && value !== 'QUALIFICATION') {
      throw new BadRequestException(
        'ESOCIAL_ENV must be PRODUCTION or QUALIFICATION',
      );
    }
    return value;
  }

  private endpointUrl(): string {
    const endpoint = this.configService.get<string>('ESOCIAL_ENDPOINT_ENVIO');
    if (!endpoint) {
      throw new BadRequestException('ESOCIAL_ENDPOINT_ENVIO is required');
    }
    return endpoint;
  }

  private batchLimit(
    environment: SubmissionEnvironment,
    limit?: number,
  ): number {
    const configured =
      environment === 'PRODUCTION'
        ? Number(
            this.configService.get<string>('ESOCIAL_BATCH_LIMIT_PRODUCTION') ??
              50,
          )
        : 50;
    const requested =
      typeof limit === 'number' && Number.isInteger(limit) && limit > 0
        ? limit
        : configured;
    return Math.max(1, Math.min(requested, configured, 50));
  }
}

function stripXmlDeclaration(xml: string): string {
  return xml.trim().replace(/^<\?xml[^>]*>\s*/u, '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
