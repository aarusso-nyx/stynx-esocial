import { createHash } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { xmlEscape } from './s1xxx-common';
import { cpf, dateOnly, ideEvento } from './s22xx-common';

export interface S2240BuildResult {
  pendingId: string;
  tenantId: string;
  environmentalExposureId: string;
  employeeId: string;
  triggerEvent: 'START' | 'END' | 'CHANGE';
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface PendingRow extends QueryResultRow {
  tenant_id: string;
  environmental_exposure_id: string;
  trigger_event: 'START' | 'END' | 'CHANGE';
}

interface ExposureSourceRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  registration: string;
  cpf: string | null;
  employee_name: string;
  cnpj: string | null;
  work_environment_code: string | null;
  work_location_name: string | null;
  responsible_cpf: string | null;
  harmful_agent_code: string;
  agent_kind: string;
  intensity_value: string | null;
  intensity_unit: string;
  exposure_start: Date | string;
  exposure_end: Date | string | null;
  mitigated_by_epi: boolean;
  mitigated_by_epc: boolean;
  special_retirement_eligible: boolean;
}

interface EpiDocRow extends QueryResultRow {
  ca_number: string;
}

@Injectable()
export class S2240Builder {
  readonly eventKind = 'S-2240' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildPending(
    tenantId: string,
    environmentalExposureId: string,
    triggerEvent: 'START' | 'END' | 'CHANGE',
  ): Promise<S2240BuildResult> {
    const pending = await this.databaseService.query<PendingRow>(
      `
      SELECT tenant_id::text, environmental_exposure_id::text, trigger_event::text
      FROM esocial.s2240_pending
      WHERE tenant_id = $1::uuid
        AND environmental_exposure_id = $2::uuid
        AND trigger_event = $3::esocial.s2240_trigger_event
      `,
      [tenantId, environmentalExposureId, triggerEvent],
    );
    const row = pending[0];
    if (!row) throw new NotFoundException('Pending S-2240 event not found');
    return this.buildFromPending(row);
  }

  async buildFromPending(pending: PendingRow): Promise<S2240BuildResult> {
    const rows = await this.databaseService.query<ExposureSourceRow>(
      `
      SELECT
        exposure.id::text,
        exposure.tenant_id::text,
        exposure.employee_id::text,
        employee.registration,
        employee.cpf,
        employee.name AS employee_name,
        company.cnpj,
        work_location.code AS work_environment_code,
        work_location.name AS work_location_name,
        responsible.cpf AS responsible_cpf,
        exposure.harmful_agent_code,
        exposure.agent_kind::text,
        exposure.intensity_value::text,
        exposure.intensity_unit,
        exposure.exposure_start,
        exposure.exposure_end,
        exposure.mitigated_by_epi,
        exposure.mitigated_by_epc,
        exposure.special_retirement_eligible
      FROM saude.environmental_exposure exposure
      JOIN hr.employee employee ON employee.id = exposure.employee_id
      JOIN saude.risk_management_program pgr
        ON pgr.id = exposure.risk_management_program_id
      LEFT JOIN hr.work_location work_location
        ON work_location.id = pgr.work_location_id
      LEFT JOIN hr.employee responsible
        ON responsible.id = pgr.responsible_engineer_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = exposure.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE exposure.tenant_id = $1::uuid
        AND exposure.id = $2::uuid
      `,
      [pending.tenant_id, pending.environmental_exposure_id],
    );
    const source = rows[0];
    if (!source)
      throw new NotFoundException('Environmental exposure not found');

    const epiDocs = await this.databaseService.query<EpiDocRow>(
      `
      SELECT DISTINCT inventory.ca_number
      FROM saude.epi_delivery delivery
      JOIN saude.epi_inventory inventory ON inventory.id = delivery.epi_inventory_id
      WHERE delivery.tenant_id = $1::uuid
        AND delivery.employee_id = $2::uuid
        AND delivery.delivered_at::date <= $3::date
      ORDER BY inventory.ca_number
      LIMIT 50
      `,
      [source.tenant_id, source.employee_id, source.exposure_start],
    );

    const id = eventId(source.tenant_id, source.id, pending.trigger_event);
    const startDate = dateOnly(source.exposure_start);
    const endDate = source.exposure_end ? dateOnly(source.exposure_end) : '';
    const quantitative = source.intensity_value !== null;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtExpRisco/v_S_01_03_00">
  <evtExpRisco Id="${id}">
    ${ideEvento()}
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${fullRegistration(source.cnpj)}</nrInsc></ideEmpregador>
    <ideVinculo><cpfTrab>${cpf(source.cpf)}</cpfTrab><matricula>${clean(source.registration, source.employee_id).slice(0, 30)}</matricula></ideVinculo>
    <infoExpRisco>
      <dtIniCondicao>${startDate}</dtIniCondicao>
      ${endDate ? `<dtFimCondicao>${endDate}</dtFimCondicao>` : ''}
      <infoAmb><localAmb>1</localAmb><dscSetor>${clean(source.work_location_name, 'Ambiente de trabalho').slice(0, 100)}</dscSetor><tpInsc>1</tpInsc><nrInsc>${fullRegistration(source.cnpj)}</nrInsc></infoAmb>
      <infoAtiv><dscAtivDes>${clean(`Executar atividades com exposicao a ${agentDescription(source)}`, 'Executar atividades laborais').slice(0, 999)}</dscAtivDes></infoAtiv>
      <agNoc>
        <codAgNoc>${source.harmful_agent_code}</codAgNoc>
        <dscAgNoc>${clean(agentDescription(source), 'Agente nocivo informado').slice(0, 100)}</dscAgNoc>
        <tpAval>${quantitative ? '1' : '2'}</tpAval>
        ${quantitative ? `<intConc>${decimal4(source.intensity_value)}</intConc><unMed>${unitCode(source.intensity_unit)}</unMed><tecMedicao>Dosimetria ocupacional</tecMedicao>` : ''}
        ${epcEpiXml(source, epiDocs)}
      </agNoc>
      <respReg><cpfResp>${cpf(source.responsible_cpf ?? source.cpf)}</cpfResp><ideOC>4</ideOC><nrOC>0001</nrOC><ufOC>SP</ufOC></respReg>
      <obs><obsCompl>${clean(`S-2240 ${pending.trigger_event} gerado pelo inventario ambiental SGP.`, 'Evento ambiental SGP').slice(0, 999)}</obsCompl></obs>
    </infoExpRisco>
  </evtExpRisco>
</eSocial>`;

    return {
      pendingId: `${source.id}:${pending.trigger_event}`,
      tenantId: source.tenant_id,
      environmentalExposureId: source.id,
      employeeId: source.employee_id,
      triggerEvent: pending.trigger_event,
      xml,
      reference: id,
      competence: startDate.slice(0, 7),
      payload: {
        environmentalExposureId: source.id,
        employeeId: source.employee_id,
        triggerEvent: pending.trigger_event,
        workEnvironmentCode: environmentCode(source.work_environment_code),
        harmfulAgentCode: source.harmful_agent_code,
        intensityValue: source.intensity_value,
        epiCount: epiDocs.length,
      },
    };
  }
}

function environmentCode(value: string | null | undefined): string | null {
  return value ? value.trim().slice(0, 30) : null;
}

function epcEpiXml(source: ExposureSourceRow, epiDocs: EpiDocRow[]): string {
  const usesEpc = source.mitigated_by_epc ? '2' : '1';
  const usesEpi = source.mitigated_by_epi ? '2' : '1';
  const epi = source.mitigated_by_epi
    ? (epiDocs.length > 0 ? epiDocs : [{ ca_number: 'CA-NAO-INFORMADO' }])
        .map(
          (row) =>
            `<epi><docAval>${clean(row.ca_number, 'CA').slice(0, 255)}</docAval></epi>`,
        )
        .join('')
    : '';
  const epiCompl = source.mitigated_by_epi
    ? '<epiCompl><medProtecao>S</medProtecao><condFuncto>S</condFuncto><usoInint>S</usoInint><przValid>S</przValid><periodicTroca>S</periodicTroca><higienizacao>S</higienizacao></epiCompl>'
    : '';
  return `<epcEpi><utilizEPC>${usesEpc}</utilizEPC>${source.mitigated_by_epc ? '<eficEpc>S</eficEpc>' : ''}<utilizEPI>${usesEpi}</utilizEPI>${source.mitigated_by_epi ? '<eficEpi>S</eficEpi>' : ''}${epi}${epiCompl}</epcEpi>`;
}

function agentDescription(source: ExposureSourceRow): string {
  if (source.harmful_agent_code === '01.01.001') {
    return `ruido ${source.intensity_value ?? ''} ${source.intensity_unit || 'dB(A)'}`.trim();
  }
  return `${source.agent_kind.toLowerCase()} ${source.harmful_agent_code}`;
}

function unitCode(unit: string): string {
  const normalized = unit.toUpperCase();
  if (normalized.includes('DBA') || normalized.includes('DB(A)')) return '4';
  if (normalized.includes('DB(C)')) return '3';
  if (normalized.includes('DB')) return '2';
  if (normalized.includes('%')) return '12';
  if (normalized.includes('MG')) return '8';
  return '4';
}

function decimal4(value: string | null): string {
  return Number(value ?? 0).toFixed(4);
}

function clean(value: string | null | undefined, fallback: string): string {
  const cleaned = String(value ?? '').trim() || fallback;
  return xmlEscape(cleaned);
}

function fullRegistration(value: string | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return (
    digits.length >= 14 ? digits.slice(0, 14) : '12345678000199'
  ).padStart(14, '0');
}

function eventId(
  tenantId: string,
  exposureId: string,
  triggerEvent: string,
): string {
  const digits = createHash('sha256')
    .update(`S-2240:${tenantId}:${exposureId}:${triggerEvent}`, 'utf8')
    .digest('hex')
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
