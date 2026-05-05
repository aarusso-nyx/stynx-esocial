import { createHash } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { onlyDigits, xmlEscape } from './s1xxx-common';
import { cpf, dateOnly, ideEmpregadorXml, ideEvento } from './s22xx-common';

export interface S2210BuildResult {
  pendingId: string;
  tenantId: string;
  catEmissionId: string;
  workAccidentId: string;
  employeeId: string;
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface PendingRow extends QueryResultRow {
  tenant_id: string;
  cat_emission_id: string;
}

interface CatSourceRow extends QueryResultRow {
  cat_emission_id: string;
  tenant_id: string;
  work_accident_id: string;
  employee_id: string;
  registration: string;
  cpf: string | null;
  cnpj: string | null;
  work_environment_code: string | null;
  accident_at: Date | string;
  accident_type: string;
  location_text: string;
  body_part_code: string;
  agent_cause_code: string;
  witness_text: string | null;
  severity: string;
  death_at: Date | string | null;
  cat_kind: 'INICIAL' | 'REABERTURA' | 'OBITO';
  emitted_at: Date | string;
  doctor_crm: string;
  doctor_name: string;
  internment: boolean;
  leave_until: Date | string | null;
  origin_receipt: string | null;
}

@Injectable()
export class S2210Builder {
  readonly eventKind = 'S-2210' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildPending(
    tenantId: string,
    catEmissionId: string,
  ): Promise<S2210BuildResult> {
    const pending = await this.databaseService.query<PendingRow>(
      `
      SELECT tenant_id::text, cat_emission_id::text
      FROM esocial.s2210_pending
      WHERE tenant_id = $1::uuid
        AND cat_emission_id = $2::uuid
      `,
      [tenantId, catEmissionId],
    );
    const row = pending[0];
    if (!row) throw new NotFoundException('Pending S-2210 event not found');
    return this.buildFromPending(row);
  }

  async buildFromPending(pending: PendingRow): Promise<S2210BuildResult> {
    const rows = await this.databaseService.query<CatSourceRow>(
      `
      SELECT
        cat.id::text AS cat_emission_id,
        cat.tenant_id::text,
        accident.id::text AS work_accident_id,
        accident.employee_id::text,
        employee.registration,
        employee.cpf,
        company.cnpj,
        work_location.code AS work_environment_code,
        accident.accident_at,
        accident.accident_type::text,
        accident.location_text,
        accident.body_part_code,
        accident.agent_cause_code,
        accident.witness_text,
        accident.severity::text,
        accident.death_at,
        cat.cat_kind::text,
        cat.emitted_at,
        cat.doctor_crm,
        cat.doctor_name,
        cat.internment,
        cat.leave_until,
        origin.reference AS origin_receipt
      FROM saude.cat_emission cat
      JOIN saude.work_accident accident ON accident.id = cat.work_accident_id
      JOIN hr.employee employee ON employee.id = accident.employee_id
      LEFT JOIN hr.work_location work_location
        ON work_location.id = employee.work_location_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = cat.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      LEFT JOIN LATERAL (
        SELECT event.reference
        FROM saude.cat_emission prior
        JOIN public.esocial_event event ON event.id = prior.esocial_event_id
        WHERE prior.tenant_id = cat.tenant_id
          AND prior.work_accident_id = cat.work_accident_id
          AND prior.id <> cat.id
          AND prior.cat_kind IN ('INICIAL'::saude.cat_kind, 'REABERTURA'::saude.cat_kind)
          AND prior.emitted_at <= cat.emitted_at
        ORDER BY prior.emitted_at DESC
        LIMIT 1
      ) origin ON true
      WHERE cat.tenant_id = $1::uuid
        AND cat.id = $2::uuid
      `,
      [pending.tenant_id, pending.cat_emission_id],
    );
    const source = rows[0];
    if (!source) throw new NotFoundException('CAT emission not found');

    const id = eventId('S-2210', source.tenant_id, source.cat_emission_id);
    const accidentDate = dateOnly(source.accident_at);
    const deathDate = source.death_at ? dateOnly(source.death_at) : '';
    const tpCat = catKindCode(source.cat_kind);
    const indCatObito = source.cat_kind === 'OBITO' ? 'S' : 'N';
    const crm = crmParts(source.doctor_crm);
    const hasLeave = source.leave_until ? 'S' : 'N';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtCAT/v_S_01_03_00">
  <evtCAT Id="${id}">
    ${ideEvento()}
    ${ideEmpregadorXml(source.cnpj)}
    <ideVinculo><cpfTrab>${cpf(source.cpf)}</cpfTrab><matricula>${clean(source.registration, source.employee_id).slice(0, 30)}</matricula></ideVinculo>
    <cat>
      <dtAcid>${accidentDate}</dtAcid>
      <tpAcid>${accidentTypeCode(source.accident_type)}</tpAcid>
      ${source.accident_type === 'DOENCA_OCUPACIONAL' ? '' : `<hrAcid>${timeOnly(source.accident_at)}</hrAcid><hrsTrabAntesAcid>0800</hrsTrabAntesAcid>`}
      <tpCat>${tpCat}</tpCat>
      <indCatObito>${indCatObito}</indCatObito>
      ${deathDate ? `<dtObito>${deathDate}</dtObito>` : ''}
      <indComunPolicia>${source.severity === 'FATAL' ? 'S' : 'N'}</indComunPolicia>
      <codSitGeradora>${code(source.agent_cause_code)}</codSitGeradora>
      <iniciatCAT>1</iniciatCAT>
      <obsCAT>${clean(source.witness_text, 'CAT registrada pelo SGP').slice(0, 999)}</obsCAT>
      <ultDiaTrab>${accidentDate}</ultDiaTrab>
      <houveAfast>${hasLeave}</houveAfast>
      <localAcidente><tpLocal>9</tpLocal><dscLocal>${clean(source.location_text, 'Local nao informado').slice(0, 255)}</dscLocal><dscLograd>Local do acidente</dscLograd><nrLograd>S/N</nrLograd></localAcidente>
      <parteAtingida><codParteAting>${code(source.body_part_code)}</codParteAting><lateralidade>0</lateralidade></parteAtingida>
      <agenteCausador><codAgntCausador>${code(source.agent_cause_code)}</codAgntCausador></agenteCausador>
      <atestado><dtAtendimento>${dateOnly(source.emitted_at)}</dtAtendimento><hrAtendimento>${timeOnly(source.emitted_at)}</hrAtendimento><indInternacao>${source.internment ? 'S' : 'N'}</indInternacao><durTrat>${treatmentDays(source.emitted_at, source.leave_until)}</durTrat><indAfast>${indCatObito === 'S' ? 'N' : hasLeave}</indAfast><dscLesao>${code(source.body_part_code)}</dscLesao><codCID>S00</codCID><emitente><nmEmit>${clean(source.doctor_name, 'Medico CAT').slice(0, 70)}</nmEmit><ideOC>1</ideOC><nrOC>${crm.number}</nrOC><ufOC>${crm.uf}</ufOC></emitente></atestado>
      ${source.cat_kind === 'INICIAL' ? '' : `<catOrigem><nrRecCatOrig>${receipt(source.origin_receipt)}</nrRecCatOrig></catOrigem>`}
    </cat>
  </evtCAT>
</eSocial>`;

    return {
      pendingId: source.cat_emission_id,
      tenantId: source.tenant_id,
      catEmissionId: source.cat_emission_id,
      workAccidentId: source.work_accident_id,
      employeeId: source.employee_id,
      xml,
      reference: id,
      competence: accidentDate.slice(0, 7),
      payload: {
        catEmissionId: source.cat_emission_id,
        workAccidentId: source.work_accident_id,
        catKind: source.cat_kind,
        workEnvironmentCode: environmentCode(source.work_environment_code),
        tpCat,
        indCatObito,
      },
    };
  }
}

function environmentCode(value: string | null | undefined): string | null {
  return value ? value.trim().slice(0, 30) : null;
}

function accidentTypeCode(value: string): string {
  if (value === 'DOENCA_OCUPACIONAL') return '2';
  if (value === 'TRAJETO') return '3';
  return '1';
}

function catKindCode(value: string): string {
  if (value === 'REABERTURA') return '2';
  if (value === 'OBITO') return '3';
  return '1';
}

function crmParts(value: string | null): { number: string; uf: string } {
  const uf = value?.match(/\b([A-Z]{2})\b/i)?.[1]?.toUpperCase() ?? 'SP';
  const number = onlyDigits(value).slice(0, 14) || '1';
  return { number, uf };
}

function code(value: string | null | undefined): string {
  return onlyDigits(value).padStart(9, '0').slice(0, 9);
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

function receipt(value: string | null): string {
  return value && /^1\.\d\.\d{19}$/u.test(value)
    ? value
    : '1.1.0000000000000000000';
}

function timeOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(11, 16).replace(':', '');
}

function treatmentDays(
  emittedAt: Date | string,
  leaveUntil: Date | string | null,
): string {
  if (!leaveUntil) return '1';
  const start = new Date(emittedAt).getTime();
  const end = new Date(leaveUntil).getTime();
  const days = Math.max(1, Math.ceil((end - start) / 86_400_000));
  return String(Math.min(days, 9999));
}
