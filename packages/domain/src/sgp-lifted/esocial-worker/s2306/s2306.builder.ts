import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { cleanText, cpf, dateOnly } from '../builders/s22xx-common';
import {
  employerRegistration,
  fullRegistration,
  sha256,
  xmlEscape,
} from '../builders/s1xxx-common';

export interface S2306BuildResult {
  changeId: string;
  tenantId: string;
  contractId: string;
  employeeId: string | null;
  eventKind: 'S-2306';
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface S2306ChangeRow extends QueryResultRow {
  change_id: string;
  tenant_id: string;
  contract_id: string;
  effective_date: Date | string;
  fields_changed: Record<string, boolean>;
  new_values: Record<string, unknown>;
  tsv_category: string;
  start_date: Date | string;
  role: string;
  monthly_amount: string;
  weekly_hours: string;
  education_institution: string | null;
  internship_plan_uri: string | null;
  employee_id: string | null;
  employee_registration: string | null;
  employee_cpf: string | null;
  company_cnpj: string | null;
}

@Injectable()
export class S2306Builder {
  readonly eventKind = 'S-2306' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(changeId: string): Promise<S2306BuildResult> {
    const rows = await this.databaseService.query<S2306ChangeRow>(
      `
      SELECT
        c.id::text AS change_id,
        c.tenant_id::text,
        tc.id::text AS contract_id,
        c.effective_date,
        c.fields_changed,
        c.new_values,
        tc.tsv_category,
        tc.start_date,
        tc.role,
        tc.monthly_amount::text,
        tc.weekly_hours::text,
        tc.education_institution,
        tc.internship_plan_uri,
        e.id::text AS employee_id,
        e.registration AS employee_registration,
        e.cpf AS employee_cpf,
        company.cnpj AS company_cnpj
      FROM hr.tsv_contract_change c
      JOIN hr.tsv_contract tc
        ON tc.tenant_id = c.tenant_id
       AND tc.id = c.tsv_contract_id
      JOIN hr.employment_link el
        ON el.id = tc.employment_link_id
      LEFT JOIN hr.employee e
        ON e.tenant_id = tc.tenant_id
       AND e.employment_link_id = el.id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = tc.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE c.id = $1::uuid
      LIMIT 1
      `,
      [changeId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('TS-V contract change not found');

    const reference = eventId(this.eventKind, row.tenant_id, row.change_id);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTSVAltContr/v_S_01_03_00">
  <evtTSVAltContr Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(row.company_cnpj)}</nrInsc></ideEmpregador>
    <ideTrabSemVinculo>${this.workerIdentityXml(row)}</ideTrabSemVinculo>
    <infoTSVAlteracao>
      <dtAlteracao>${dateOnly(row.effective_date)}</dtAlteracao>
      ${this.infoComplementaresXml(row)}
    </infoTSVAlteracao>
  </evtTSVAltContr>
</eSocial>`;

    return {
      changeId: row.change_id,
      tenantId: row.tenant_id,
      contractId: row.contract_id,
      employeeId: row.employee_id,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: dateOnly(row.effective_date).slice(0, 7),
      payload: {
        tsvContractId: row.contract_id,
        fieldsChanged: row.fields_changed,
        newValues: row.new_values,
      },
    };
  }

  private workerIdentityXml(row: S2306ChangeRow): string {
    const registration = row.employee_registration?.trim();
    const category = row.tsv_category.trim();
    const registrationOrCategory = registration
      ? `<matricula>${xmlEscape(registration.slice(0, 30))}</matricula>`
      : `<codCateg>${xmlEscape(category)}</codCateg>`;
    return `<cpfTrab>${cpf(row.employee_cpf)}</cpfTrab>${registrationOrCategory}`;
  }

  private infoComplementaresXml(row: S2306ChangeRow): string {
    const pieces: string[] = [];
    if (row.fields_changed.role) {
      pieces.push(
        `<cargoFuncao><nmCargo>${cleanText(
          scalarText(row.new_values.role, row.role),
          'TSV',
        ).slice(0, 100)}</nmCargo></cargoFuncao>`,
      );
    }
    if (row.fields_changed.monthly_amount) {
      pieces.push(
        `<remuneracao><vrSalFx>${money(
          row.new_values.monthly_amount ?? row.monthly_amount,
        )}</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>`,
      );
    }
    if (
      row.fields_changed.education_institution ||
      row.fields_changed.internship_plan_uri
    ) {
      pieces.push(this.internshipXml(row));
    }
    if (row.fields_changed.workplace_id) {
      pieces.push(
        `<localTrabGeral><tpInsc>1</tpInsc><nrInsc>${fullRegistration(
          row.company_cnpj,
        )}</nrInsc></localTrabGeral>`,
      );
    }
    if (pieces.length === 0) {
      pieces.push(
        `<remuneracao><vrSalFx>${money(row.monthly_amount)}</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>`,
      );
    }
    return `<infoComplementares>${pieces.join('')}</infoComplementares>`;
  }

  private internshipXml(row: S2306ChangeRow): string {
    const institution = cleanText(
      scalarText(
        row.new_values.education_institution ??
          row.education_institution ??
          'Instituicao de Ensino',
        'Instituicao de Ensino',
      ),
      'Instituicao de Ensino',
    );
    return `<infoEstagiario><natEstagio>N</natEstagio><nivEstagio>4</nivEstagio><areaAtuacao>${cleanText(
      scalarText(row.new_values.role, row.role),
      'Estagio',
    ).slice(
      0,
      100,
    )}</areaAtuacao><dtPrevTerm>2026-12-31</dtPrevTerm><instEnsino><nmRazao>${institution.slice(
      0,
      100,
    )}</nmRazao><dscLograd>Nao informado</dscLograd><nrLograd>S/N</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></instEnsino></infoEstagiario>`;
  }
}

function money(value: unknown): string {
  const numeric = Number(scalarText(value, '0').replace(',', '.'));
  if (!Number.isFinite(numeric)) return '0.00';
  return numeric.toFixed(2);
}

function scalarText(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function eventId(
  eventKind: string,
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
