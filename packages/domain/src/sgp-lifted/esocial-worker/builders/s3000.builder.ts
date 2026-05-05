import { createHash } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, xmlEscape } from './s1xxx-common';
import { cpf } from './s22xx-common';

export interface S3000BuildResult {
  requestId: string;
  tenantId: string;
  targetEventId: string;
  targetEventKind: string;
  targetRecibo: string;
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface RequestRow extends QueryResultRow {
  request_id: string;
  tenant_id: string;
  target_event_id: string;
  target_recibo: string;
  target_event_kind: string;
  justification: string;
  target_competence: string;
  source_entity_kind: string | null;
  source_entity_id: string | null;
  cnpj: string | null;
  cpf: string | null;
}

@Injectable()
export class S3000Builder {
  readonly eventKind = 'S-3000' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildRequest(
    tenantId: string,
    requestId: string,
  ): Promise<S3000BuildResult> {
    const rows = await this.databaseService.query<RequestRow>(
      `
      SELECT
        request.request_id::text,
        request.tenant_id::text,
        request.target_event_id::text,
        request.target_recibo,
        request.target_event_kind,
        request.justification,
        event.competence AS target_competence,
        event.source_entity_kind,
        event.source_entity_id,
        company.cnpj,
        employee.cpf
      FROM esocial.s3000_request request
      JOIN public.esocial_event event
        ON event.id = request.target_event_id
       AND event.tenant_id = request.tenant_id
      LEFT JOIN hr.employee employee
        ON event.source_entity_kind = 'employee'
       AND employee.id::text = event.source_entity_id
       AND employee.tenant_id = event.tenant_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = request.tenant_id
          AND status = 'ACTIVE'::public."RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE request.tenant_id = $1::uuid
        AND request.request_id = $2::uuid
        AND request.status = 'PENDING'
      `,
      [tenantId, requestId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Pending S-3000 request not found');

    const id = eventId('S-3000', tenantId, requestId);
    const workerXml = row.cpf
      ? `<ideTrabalhador><cpfTrab>${cpf(row.cpf)}</cpfTrab></ideTrabalhador>`
      : '';
    const payrollXml = isPeriodic(row.target_event_kind)
      ? `<ideFolhaPagto><indApuracao>1</indApuracao><perApur>${xmlEscape(row.target_competence)}</perApur></ideFolhaPagto>`
      : '';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtExclusao/v_S_01_03_00">
  <evtExclusao Id="${id}">
    <ideEvento><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(row.cnpj)}</nrInsc></ideEmpregador>
    <infoExclusao>
      <tpEvento>${xmlEscape(row.target_event_kind)}</tpEvento>
      <nrRecEvt>${xmlEscape(row.target_recibo)}</nrRecEvt>
      ${workerXml}
      ${payrollXml}
    </infoExclusao>
  </evtExclusao>
</eSocial>`;

    return {
      requestId,
      tenantId,
      targetEventId: row.target_event_id,
      targetEventKind: row.target_event_kind,
      targetRecibo: row.target_recibo,
      xml,
      reference: id,
      competence: row.target_competence,
      payload: {
        requestId,
        targetEventId: row.target_event_id,
        targetEventKind: row.target_event_kind,
        targetRecibo: row.target_recibo,
        sourceEntityKind: row.source_entity_kind,
        sourceEntityId: row.source_entity_id,
        justification: row.justification,
      },
    };
  }
}

function isPeriodic(eventKind: string): boolean {
  return ['S-1200', 'S-1202', 'S-1207', 'S-1210', 'S-1280', 'S-1300'].includes(
    eventKind,
  );
}

function eventId(
  eventKind: string,
  tenantId: string,
  sourceId: string,
): string {
  const digits = createHash('sha256')
    .update(`${eventKind}:${tenantId}:${sourceId}`, 'utf8')
    .digest('hex')
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
