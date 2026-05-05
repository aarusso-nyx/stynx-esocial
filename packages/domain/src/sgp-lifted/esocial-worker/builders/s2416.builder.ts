import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, onlyDigits, sha256 } from './s1xxx-common';
import { cleanText, dateOnly } from './shared-worker-common';
import { s2410BenefitNumber } from './s2410.builder';

export interface S2416BuildResult {
  pensionGrantId: string;
  tenantId: string;
  eventKind: 'S-2416';
  xml: string;
  reference: string;
  competence: string;
  sourceEntityKind: 'hr.pension_grant';
  payload: Record<string, unknown>;
}

interface PensionFounderRow extends QueryResultRow {
  pension_grant_id: string;
  tenant_id: string;
  instituting_employee_id: string | null;
  instituting_registration: string | null;
  instituting_cpf: string | null;
  beneficiary_cpf: string | null;
  kinship: string | null;
  benefit_type: string;
  apportionment_type: string;
  nature: string;
  granted_on: Date | string;
  legal_basis: string;
  company_cnpj: string | null;
}

@Injectable()
export class S2416Builder {
  readonly eventKind = 'S-2416' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildPensionGrant(pensionGrantId: string): Promise<S2416BuildResult> {
    const rows = await this.databaseService.query<PensionFounderRow>(
      `
      SELECT
        pension.id::text AS pension_grant_id,
        pension.tenant_id::text,
        employee.id::text AS instituting_employee_id,
        employee.registration AS instituting_registration,
        employee.cpf AS instituting_cpf,
        pension.beneficiary_cpf,
        pension.kinship,
        pension.benefit_type,
        pension.apportionment_type,
        pension.nature,
        pension.granted_on,
        pension.legal_basis,
        company.cnpj AS company_cnpj
      FROM hr.pension_grant pension
      LEFT JOIN hr.employee employee
        ON employee.tenant_id = pension.tenant_id
       AND employee.id = pension.instituting_employee_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = pension.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE pension.id = $1::uuid
      LIMIT 1
      `,
      [pensionGrantId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Pension founder grant not found');

    const cpf = beneficiaryCpf(row.beneficiary_cpf);
    const alterationDate = requiredDate(row.granted_on, 'pension.granted_on');
    const benefitNumber = s2410BenefitNumber('PEN', row.pension_grant_id);
    const benefitType = benefitTypeCode(row.benefit_type, '0601');
    const reference = eventId(
      this.eventKind,
      row.tenant_id,
      row.pension_grant_id,
    );
    const pensionDeathGroupXml = pensionDeathXml(
      row.apportionment_type,
      row.kinship,
    );
    const description = benefitDescription(
      row.legal_basis,
      row.nature,
      row.apportionment_type,
    );
    const descriptionXml = description ? `<dsc>${description}</dsc>` : '';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtCdBenAlt/v_S_01_03_00">
  <evtCdBenAlt Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(row.company_cnpj)}</nrInsc></ideEmpregador>
    <ideBeneficio><cpfBenef>${cpf}</cpfBenef><nrBeneficio>${benefitNumber}</nrBeneficio></ideBeneficio>
    <infoBenAlteracao>
      <dtAltBeneficio>${alterationDate}</dtAltBeneficio>
      <dadosBeneficio>
        <tpBeneficio>${benefitType}</tpBeneficio>
        <tpPlanRP>0</tpPlanRP>
        ${descriptionXml}
        <indSuspensao>N</indSuspensao>
        ${pensionDeathGroupXml}
      </dadosBeneficio>
    </infoBenAlteracao>
  </evtCdBenAlt>
</eSocial>`;

    return {
      pensionGrantId: row.pension_grant_id,
      tenantId: row.tenant_id,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: alterationDate.slice(0, 7),
      sourceEntityKind: 'hr.pension_grant',
      payload: {
        sourceKind: 'PENSION',
        pensionGrantId: row.pension_grant_id,
        institutingEmployeeId: row.instituting_employee_id,
        cpfBenef: cpf,
        cpfInstituidor: onlyDigits(row.instituting_cpf),
        matriculaInstituidor: row.instituting_registration,
        nrBeneficio: benefitNumber,
        tpBeneficio: benefitType,
        tpPlanRP: '0',
        grantedOn: alterationDate,
        tpPenMorte: pensionDeathType(row.apportionment_type),
        tpDepInst: dependentType(row.kinship).code,
      },
    };
  }
}

function beneficiaryCpf(value: string | null | undefined) {
  const digits = onlyDigits(value);
  if (digits.length !== 11) {
    throw new BadRequestException('S-2416 beneficiary CPF must have 11 digits');
  }
  return digits;
}

function benefitTypeCode(value: string | null | undefined, fallback: string) {
  const direct = onlyDigits(value);
  if (direct.length === 4) return direct;
  return fallback;
}

function benefitDescription(...values: Array<string | null | undefined>) {
  return cleanText(values.filter(Boolean).join(' - '), '').slice(0, 255);
}

function pensionDeathXml(
  apportionmentType: string,
  kinship: string | null,
): string {
  const dependent = dependentType(kinship);
  const descriptionXml =
    dependent.code === '99'
      ? `<descrDepInst>${dependent.description}</descrDepInst>`
      : '';
  return `<infoPenMorte><tpPenMorte>${pensionDeathType(
    apportionmentType,
  )}</tpPenMorte><instPenMorte><tpDepInst>${dependent.code}</tpDepInst>${descriptionXml}</instPenMorte></infoPenMorte>`;
}

function pensionDeathType(apportionmentType: string): '1' | '2' {
  const normalized = apportionmentType.toLowerCase();
  return normalized.includes('tempor') ? '2' : '1';
}

function dependentType(value: string | null | undefined): {
  code: string;
  description: string;
} {
  const normalized = cleanText(value ?? '', '').toLowerCase();
  if (/^0[1-9]$|^1[0-7]$|^99$/.test(normalized)) {
    return { code: normalized, description: 'Outros' };
  }
  if (/conjuge|c[oô]njuge|espos/.test(normalized)) {
    return { code: '01', description: 'Conjuge' };
  }
  if (/companheir/.test(normalized)) {
    return { code: '02', description: 'Companheiro' };
  }
  if (/entead/.test(normalized)) {
    return { code: '04', description: 'Enteado' };
  }
  if (/irma|irm[aã]o/.test(normalized)) {
    return { code: '06', description: 'Irmao' };
  }
  if (/net/.test(normalized)) {
    return { code: '07', description: 'Neto' };
  }
  if (/pai|mae|m[aã]e|pais/.test(normalized)) {
    return { code: '09', description: 'Pais' };
  }
  if (/filh/.test(normalized)) {
    return { code: '03', description: 'Filho' };
  }
  const description = cleanText(value ?? 'Outros', 'Outros').slice(0, 100);
  return { code: '99', description };
}

function requiredDate(
  value: Date | string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new BadRequestException(`S-2416 ${field} is required`);
  }
  return dateOnly(value);
}

function eventId(
  eventKind: 'S-2416',
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
