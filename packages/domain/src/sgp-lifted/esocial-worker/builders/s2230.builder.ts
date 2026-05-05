import { createHash } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  cleanText,
  cpf,
  dateOnly,
  ideEmpregadorXml,
  ideEvento,
} from './s22xx-common';

export interface S2230BuildResult {
  pendingId: string;
  tenantId: string;
  sourceEntityId: string;
  sourceEntityKind: 'hr.leave_record' | 'hr.vacation_record';
  employeeId: string;
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface PendingRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  leave_or_vacation_id: string;
  kind: 'LEAVE' | 'VACATION';
  trigger_event: 'START' | 'END' | 'EXTENSION';
}

interface SourceRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  registration: string;
  cpf: string | null;
  starts_on: Date | string;
  ends_on: Date | string | null;
  notes: string | null;
  cnpj: string | null;
  absence_reason_code: string | null;
  absence_reason_description: string | null;
  accrual_period_start: Date | string | null;
  accrual_period_end: Date | string | null;
}

@Injectable()
export class S2230Builder {
  readonly eventKind = 'S-2230' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildPending(
    tenantId: string,
    pendingId: string,
  ): Promise<S2230BuildResult> {
    const pending = await this.databaseService.query<PendingRow>(
      `
      SELECT id::text, tenant_id::text, leave_or_vacation_id::text, kind::text, trigger_event::text
      FROM esocial.s2230_pending
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
        AND status = 'PENDING'
      `,
      [tenantId, pendingId],
    );
    const row = pending[0];
    if (!row) throw new NotFoundException('Pending S-2230 event not found');
    return this.buildFromPending(row);
  }

  async buildFromPending(pending: PendingRow): Promise<S2230BuildResult> {
    const rows = await this.databaseService.query<SourceRow>(
      pending.kind === 'VACATION' ? vacationSql() : leaveSql(),
      [pending.tenant_id, pending.leave_or_vacation_id],
    );
    const source = rows[0];
    if (!source) throw new NotFoundException('S-2230 source record not found');

    const id = eventId(
      'S-2230',
      source.tenant_id,
      `${pending.id}:${source.id}`,
    );
    const reason = reasonCode(pending.kind, source);
    const periodXml =
      pending.trigger_event === 'END'
        ? `<fimAfastamento><dtTermAfast>${dateOnly(source.ends_on)}</dtTermAfast></fimAfastamento>`
        : `<iniAfastamento><dtIniAfast>${dateOnly(source.starts_on)}</dtIniAfast><codMotAfast>${reason}</codMotAfast>${source.notes ? `<observacao>${cleanText(source.notes, 'Afastamento')}</observacao>` : ''}${vacationAccrualXml(pending.kind, source)}</iniAfastamento>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAfastTemp/v_S_01_03_00">
  <evtAfastTemp Id="${id}">
    ${ideEvento()}
    ${ideEmpregadorXml(source.cnpj)}
    <ideVinculo><cpfTrab>${cpf(source.cpf)}</cpfTrab><matricula>${cleanText(source.registration, source.employee_id).slice(0, 30)}</matricula></ideVinculo>
    <infoAfastamento>${periodXml}</infoAfastamento>
  </evtAfastTemp>
</eSocial>`;

    return {
      pendingId: pending.id,
      tenantId: source.tenant_id,
      sourceEntityId: source.id,
      sourceEntityKind:
        pending.kind === 'VACATION' ? 'hr.vacation_record' : 'hr.leave_record',
      employeeId: source.employee_id,
      xml,
      reference: id,
      competence: dateOnly(source.starts_on).slice(0, 7),
      payload: {
        pendingId: pending.id,
        kind: pending.kind,
        triggerEvent: pending.trigger_event,
        codMotAfast: reason,
        sourceEntityId: source.id,
      },
    };
  }
}

function leaveSql(): string {
  return `
    SELECT
      leave_record.id::text,
      leave_record.tenant_id::text,
      leave_record.employee_id::text,
      employee.registration,
      employee.cpf,
      leave_record.starts_on,
      leave_record.ends_on,
      leave_record.notes,
      company.cnpj,
      reason.code AS absence_reason_code,
      reason.description AS absence_reason_description,
      NULL::date AS accrual_period_start,
      NULL::date AS accrual_period_end
    FROM hr.leave_record
    JOIN hr.employee ON employee.id = leave_record.employee_id
    LEFT JOIN hr.absence_reason reason ON reason.id = leave_record.absence_reason_id
    LEFT JOIN LATERAL (
      SELECT cnpj
      FROM hr.company
      WHERE tenant_id = leave_record.tenant_id
        AND status = 'ACTIVE'::"RecordStatus"
      ORDER BY code
      LIMIT 1
    ) company ON true
    WHERE leave_record.tenant_id = $1::uuid
      AND leave_record.id = $2::uuid
  `;
}

function vacationSql(): string {
  return `
    SELECT
      vacation.id::text,
      vacation.tenant_id::text,
      vacation.employee_id::text,
      employee.registration,
      employee.cpf,
      vacation.starts_on,
      vacation.ends_on,
      NULL::text AS notes,
      company.cnpj,
      NULL::text AS absence_reason_code,
      NULL::text AS absence_reason_description,
      vacation.accrual_period_start,
      vacation.accrual_period_end
    FROM hr.vacation_record vacation
    JOIN hr.employee ON employee.id = vacation.employee_id
    LEFT JOIN LATERAL (
      SELECT cnpj
      FROM hr.company
      WHERE tenant_id = vacation.tenant_id
        AND status = 'ACTIVE'::"RecordStatus"
      ORDER BY code
      LIMIT 1
    ) company ON true
    WHERE vacation.tenant_id = $1::uuid
      AND vacation.id = $2::uuid
  `;
}

function reasonCode(kind: PendingRow['kind'], source: SourceRow): string {
  if (kind === 'VACATION') return '15';
  const text =
    `${source.absence_reason_code ?? ''} ${source.absence_reason_description ?? ''}`.toLowerCase();
  if (text.includes('matern')) return '17';
  if (text.includes('acidente')) return '03';
  if (
    text.includes('saude') ||
    text.includes('saúde') ||
    text.includes('medic')
  ) {
    return '01';
  }
  return '21';
}

function vacationAccrualXml(
  kind: PendingRow['kind'],
  source: SourceRow,
): string {
  if (kind !== 'VACATION' || !source.accrual_period_start) return '';
  const end = source.accrual_period_end
    ? `<dtFim>${dateOnly(source.accrual_period_end)}</dtFim>`
    : '';
  return `<perAquis><dtInicio>${dateOnly(source.accrual_period_start)}</dtInicio>${end}</perAquis>`;
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
