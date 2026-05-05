import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { fullRegistration } from './s1xxx-common';
import {
  cleanText,
  cpf,
  dateOnly,
  eventId,
  ideEmpregadorXml,
  ideEvento,
  S22xxSourceRecord,
} from './s22xx-common';

export type S2206ChangeKind = 'PROMOTION' | 'TRANSFER' | 'REGIME_CHANGE';

export interface S2206BuildInput {
  sourceId?: string;
  changeKind?: S2206ChangeKind;
  changeDate?: Date | string;
  effectiveDate?: Date | string;
  description?: string;
  competence?: string;
}

interface EmployeeContractRow extends QueryResultRow {
  employee_id: string;
  tenant_id: string;
  registration: string;
  cpf: string | null;
  updated_at: Date | string;
  hired_on: Date | string | null;
  abono_permanencia_ativo: boolean;
  contract_starts_on: Date | string | null;
  employment_link_id: string | null;
  link_contract_type: string | null;
  link_updated_at: Date | string | null;
  link_end_date: Date | string | null;
  job_position_name: string | null;
  job_function_name: string | null;
  company_cnpj: string | null;
  branch_cnpj: string | null;
  work_location_name: string | null;
}

@Injectable()
export class S2206Builder {
  readonly eventKind = 'S-2206' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    employeeId: string,
    input: S2206BuildInput = {},
  ): Promise<S22xxSourceRecord> {
    const rows = await this.databaseService.query<EmployeeContractRow>(
      `
      SELECT
        e.id::text AS employee_id,
        e.tenant_id::text,
        e.registration,
        e.cpf,
        e.updated_at,
        e.hired_on,
        e.abono_permanencia_ativo,
        e.employment_link_id::text,
        el.contract_type AS link_contract_type,
        el.updated_at AS link_updated_at,
        el.end_date AS link_end_date,
        jp.name AS job_position_name,
        jf.name AS job_function_name,
        ec.starts_on AS contract_starts_on,
        company.cnpj AS company_cnpj,
        COALESCE(branch.cnpj, work_branch.cnpj) AS branch_cnpj,
        wl.name AS work_location_name
      FROM hr.employee e
      LEFT JOIN hr.employment_link el
        ON el.tenant_id = e.tenant_id
       AND el.id = e.employment_link_id
      LEFT JOIN hr.job_position jp
        ON jp.tenant_id = e.tenant_id
       AND jp.id = e.job_position_id
      LEFT JOIN hr.job_function jf
        ON jf.id = e.job_function_id
      LEFT JOIN LATERAL (
        SELECT starts_on
        FROM hr.employment_contract
        WHERE tenant_id = e.tenant_id
          AND employee_id = e.id
        ORDER BY starts_on DESC, created_at DESC
        LIMIT 1
      ) ec ON true
      LEFT JOIN hr.branch branch
        ON branch.id = e.branch_id
      LEFT JOIN hr.company branch_company
        ON branch_company.id = branch.company_id
      LEFT JOIN hr.work_location wl
        ON wl.tenant_id = e.tenant_id
       AND wl.id = e.work_location_id
      LEFT JOIN hr.branch work_branch
        ON work_branch.id = wl.branch_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = e.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) fallback_company ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(branch_company.cnpj, fallback_company.cnpj) AS cnpj
      ) company ON true
      WHERE e.tenant_id = $1::uuid
        AND e.id = $2::uuid
      LIMIT 1
      `,
      [tenantId, employeeId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Employee not found');

    const sourceId = input.sourceId ?? row.employee_id;
    const reference = eventId(this.eventKind, tenantId, sourceId);
    const changeDate = dateOnly(
      input.changeDate ?? row.link_updated_at ?? row.updated_at,
    );
    const effectiveDate = dateOnly(
      input.effectiveDate ?? row.contract_starts_on ?? row.hired_on,
    );
    const description = cleanText(
      input.description ?? defaultDescription(input.changeKind),
      'Alteracao contratual',
    ).slice(0, 150);
    const regime = regimeFor(row.link_contract_type);
    const localRegistration = fullRegistration(
      row.branch_cnpj ?? row.company_cnpj,
    );
    const localDescription = row.work_location_name
      ? `<descComp>${cleanText(row.work_location_name, 'Local de trabalho').slice(0, 80)}</descComp>`
      : '';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAltContratual/v_S_01_03_00">
  <evtAltContratual Id="${reference}">
    ${ideEvento()}
    ${ideEmpregadorXml(row.company_cnpj)}
    <ideVinculo><cpfTrab>${cpf(row.cpf)}</cpfTrab><matricula>${cleanText(row.registration, row.employee_id).slice(0, 30)}</matricula></ideVinculo>
    <altContratual>
      <dtAlteracao>${changeDate}</dtAlteracao>
      <dtEf>${effectiveDate}</dtEf>
      <dscAlt>${description}</dscAlt>
      <vinculo>
        <tpRegPrev>${regime.tpRegPrev}</tpRegPrev>
        ${regime.infoRegimeTrabXml(row)}
        <infoContrato><nmCargo>${cleanText(row.job_position_name, 'Servidor Publico').slice(0, 100)}</nmCargo>${row.job_function_name ? `<nmFuncao>${cleanText(row.job_function_name, 'Funcao Publica').slice(0, 100)}</nmFuncao>` : ''}<acumCargo>N</acumCargo><codCateg>${regime.codCateg}</codCateg>${regime.extraInfoContratoXml(row)}<localTrabalho><localTrabGeral><tpInsc>1</tpInsc><nrInsc>${localRegistration}</nrInsc>${localDescription}</localTrabGeral></localTrabalho></infoContrato>
      </vinculo>
    </altContratual>
  </evtAltContratual>
</eSocial>`;

    return {
      id: sourceId,
      tenantId,
      employeeId: row.employee_id,
      sourceEntityKind: 'employee',
      xml,
      reference,
      competence: input.competence ?? changeDate.slice(0, 7),
      payload: {
        eventKind: this.eventKind,
        sourceEntityKind: 'employee',
        sourceEntityId: sourceId,
        employeeId: row.employee_id,
        employmentLinkId: row.employment_link_id,
        changeKind: input.changeKind ?? 'REGIME_CHANGE',
        changeDate,
        effectiveDate,
        contractType: row.link_contract_type ?? 'statutory',
        codCateg: regime.codCateg,
        tpRegPrev: regime.tpRegPrev,
      },
    };
  }
}

function defaultDescription(kind: S2206ChangeKind | undefined): string {
  if (kind === 'PROMOTION') return 'Promocao funcional';
  if (kind === 'TRANSFER') return 'Transferencia de lotacao';
  if (kind === 'REGIME_CHANGE') return 'Alteracao de regime juridico';
  return 'Alteracao contratual';
}

function regimeFor(contractType: string | null): {
  codCateg: string;
  tpRegPrev: string;
  infoRegimeTrabXml: (row: EmployeeContractRow) => string;
  extraInfoContratoXml: (row: EmployeeContractRow) => string;
} {
  const normalized = String(contractType ?? 'statutory').toLowerCase();
  if (normalized === 'celetista') {
    return {
      codCateg: '101',
      tpRegPrev: '1',
      extraInfoContratoXml: () => '',
      infoRegimeTrabXml: () =>
        '<infoRegimeTrab><infoCeletista><tpRegJor>1</tpRegJor><natAtividade>1</natAtividade><cnpjSindCategProf>12345678000199</cnpjSindCategProf></infoCeletista></infoRegimeTrab>',
    };
  }
  if (normalized === 'temporary') {
    return {
      codCateg: '306',
      tpRegPrev: '1',
      extraInfoContratoXml: (row) =>
        `<duracao><tpContr>2</tpContr><dtTerm>${dateOnly(row.link_end_date)}</dtTerm></duracao>`,
      infoRegimeTrabXml: () =>
        '<infoRegimeTrab><infoCeletista><tpRegJor>1</tpRegJor><natAtividade>1</natAtividade><cnpjSindCategProf>12345678000199</cnpjSindCategProf></infoCeletista></infoRegimeTrab>',
    };
  }
  return {
    codCateg: normalized === 'commissioned' ? '302' : '301',
    tpRegPrev: '2',
    extraInfoContratoXml: () => '',
    infoRegimeTrabXml: (row) =>
      `<infoRegimeTrab><infoEstatutario><tpPlanRP>0</tpPlanRP><indTetoRGPS>N</indTetoRGPS><indAbonoPerm>${row.abono_permanencia_ativo ? 'S' : 'N'}</indAbonoPerm></infoEstatutario></infoRegimeTrab>`,
  };
}
