import { createHash } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, onlyDigits, xmlEscape } from './s1xxx-common';
import { cpf, dateOnly, ideEvento } from './s22xx-common';

export interface S2220BuildResult {
  pendingId: string;
  tenantId: string;
  asoRecordId: string;
  employeeId: string;
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface PendingRow extends QueryResultRow {
  tenant_id: string;
  aso_record_id: string;
}

interface AsoSourceRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  registration: string;
  cpf: string | null;
  aso_kind: string;
  performed_at: Date | string | null;
  scheduled_at: Date | string;
  doctor_crm: string | null;
  doctor_name: string | null;
  conclusion: string | null;
  cnpj: string | null;
  work_environment_code: string | null;
}

interface AsoExamRow extends QueryResultRow {
  code: string | null;
  name: string | null;
  result_summary: string | null;
  created_at: Date | string | null;
}

@Injectable()
export class S2220Builder {
  readonly eventKind = 'S-2220' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildPending(
    tenantId: string,
    asoRecordId: string,
  ): Promise<S2220BuildResult> {
    const pending = await this.databaseService.query<PendingRow>(
      `
      SELECT tenant_id::text, aso_record_id::text
      FROM esocial.s2220_pending
      WHERE tenant_id = $1::uuid
        AND aso_record_id = $2::uuid
      `,
      [tenantId, asoRecordId],
    );
    const row = pending[0];
    if (!row) throw new NotFoundException('Pending S-2220 event not found');
    return this.buildFromPending(row);
  }

  async buildFromPending(pending: PendingRow): Promise<S2220BuildResult> {
    const sources = await this.databaseService.query<AsoSourceRow>(
      `
      SELECT
        aso.id::text,
        aso.tenant_id::text,
        aso.employee_id::text,
        employee.registration,
        employee.cpf,
        aso.aso_kind::text,
        aso.performed_at,
        aso.scheduled_at,
        aso.doctor_crm,
        aso.doctor_name,
        aso.conclusion::text,
        company.cnpj,
        work_location.code AS work_environment_code
      FROM saude.aso_record aso
      JOIN hr.employee employee ON employee.id = aso.employee_id
      LEFT JOIN hr.work_location work_location
        ON work_location.id = employee.work_location_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = aso.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE aso.tenant_id = $1::uuid
        AND aso.id = $2::uuid
        AND aso.status = 'ARCHIVED'::saude.aso_status
      `,
      [pending.tenant_id, pending.aso_record_id],
    );
    const source = sources[0];
    if (!source) throw new NotFoundException('Archived ASO record not found');

    const exams = await this.databaseService.query<AsoExamRow>(
      `
      SELECT exam.code, exam.name, item.result_summary, item.created_at
      FROM saude.aso_exam_item item
      JOIN saude.medical_exam exam ON exam.id = item.medical_exam_id
      WHERE item.tenant_id = $1::uuid
        AND item.aso_record_id = $2::uuid
      ORDER BY item.created_at, exam.code
      `,
      [source.tenant_id, source.id],
    );

    const id = eventId('S-2220', source.tenant_id, source.id);
    const asoDate = dateOnly(source.performed_at ?? source.scheduled_at);
    const crm = crmParts(source.doctor_crm);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtMonit/v_S_01_03_00">
  <evtMonit Id="${id}">
    ${ideEvento()}
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(source.cnpj)}</nrInsc></ideEmpregador>
    <ideVinculo><cpfTrab>${cpf(source.cpf)}</cpfTrab><matricula>${clean(source.registration, source.employee_id).slice(0, 30)}</matricula></ideVinculo>
    <exMedOcup>
      <tpExameOcup>${asoKindCode(source.aso_kind)}</tpExameOcup>
      <aso>
        <dtAso>${asoDate}</dtAso>
        <resAso>${conclusionCode(source.conclusion)}</resAso>
        ${examXml(exams, asoDate)}
        <medico><nmMed>${clean(source.doctor_name, 'Medico ASO').slice(0, 70)}</nmMed><nrCRM>${crm.number}</nrCRM>${crm.uf ? `<ufCRM>${crm.uf}</ufCRM>` : ''}</medico>
      </aso>
    </exMedOcup>
  </evtMonit>
</eSocial>`;

    return {
      pendingId: source.id,
      tenantId: source.tenant_id,
      asoRecordId: source.id,
      employeeId: source.employee_id,
      xml,
      reference: id,
      competence: asoDate.slice(0, 7),
      payload: {
        asoRecordId: source.id,
        asoKind: source.aso_kind,
        workEnvironmentCode: environmentCode(source.work_environment_code),
        tpExameOcup: asoKindCode(source.aso_kind),
        examCount: Math.max(exams.length, 1),
      },
    };
  }
}

function environmentCode(value: string | null | undefined): string | null {
  return value ? value.trim().slice(0, 30) : null;
}

function examXml(exams: AsoExamRow[], asoDate: string): string {
  const rows =
    exams.length > 0
      ? exams
      : [
          {
            code: '0295',
            name: 'Avaliacao clinica ocupacional',
            result_summary: 'Avaliacao clinica do ASO',
            created_at: asoDate,
          },
        ];
  return rows
    .map((exam) => {
      const proc = procedureCode(exam.code);
      const obs = clean(
        exam.result_summary || exam.name,
        'Exame ocupacional realizado',
      ).slice(0, 999);
      return `<exame><dtExm>${dateOnly(exam.created_at ?? asoDate)}</dtExm><procRealizado>${proc}</procRealizado><obsProc>${obs}</obsProc><indResult>1</indResult></exame>`;
    })
    .join('');
}

function procedureCode(value: string | null): string {
  const digits = onlyDigits(value);
  return digits.length >= 4 ? digits.slice(0, 4) : '0295';
}

function asoKindCode(value: string): string {
  switch (value) {
    case 'ADMISSIONAL':
      return '0';
    case 'PERIODICO':
      return '1';
    case 'RETORNO_TRABALHO':
      return '2';
    case 'MUDANCA_FUNCAO':
      return '3';
    case 'DEMISSIONAL':
      return '9';
    default:
      return '4';
  }
}

function conclusionCode(value: string | null): string {
  return value === 'INAPTO' ? '2' : '1';
}

function crmParts(value: string | null): { number: string; uf: string | null } {
  if (!value) return { number: '', uf: null };
  const uf = value.match(/\b([A-Z]{2})\b/i)?.[1]?.toUpperCase() ?? 'SP';
  const digits = onlyDigits(value).slice(0, 10);
  return { number: digits, uf };
}

function clean(value: string | null | undefined, fallback: string): string {
  const cleaned = String(value ?? '').trim() || fallback;
  return xmlEscape(cleaned);
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
