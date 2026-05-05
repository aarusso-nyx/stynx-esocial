import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, onlyDigits, sha256 } from './s1xxx-common';
import { cleanText, dateOnly } from './shared-worker-common';

export type S2410BenefitSourceKind = 'RETIREMENT' | 'PENSION';

export interface S2410BuildResult {
  sourceKind: S2410BenefitSourceKind;
  sourceId: string;
  tenantId: string;
  eventKind: 'S-2410';
  xml: string;
  reference: string;
  competence: string;
  sourceEntityKind: 'hr.retirement_grant' | 'hr.pension_grant';
  payload: Record<string, unknown>;
}

interface RetirementBenefitRow extends QueryResultRow {
  retirement_grant_id: string;
  tenant_id: string;
  employee_id: string;
  employee_registration: string | null;
  employee_cpf: string | null;
  granted_on: Date | string;
  legal_basis: string;
  appointment_act: string;
  rule_name: string;
  company_cnpj: string | null;
}

interface PensionBenefitRow extends QueryResultRow {
  pension_grant_id: string;
  tenant_id: string;
  instituting_employee_id: string | null;
  instituting_registration: string | null;
  instituting_cpf: string | null;
  beneficiary_cpf: string | null;
  benefit_type: string;
  apportionment_type: string;
  nature: string;
  granted_on: Date | string;
  legal_basis: string;
  company_cnpj: string | null;
}

interface BenefitData {
  sourceKind: S2410BenefitSourceKind;
  sourceId: string;
  tenantId: string;
  beneficiaryCpf: string;
  registration?: string | null;
  companyCnpj: string | null;
  grantedOn: string;
  benefitNumber: string;
  benefitType: string;
  planType: string;
  description: string;
  judicialDecision: 'S' | 'N';
  pensionDeathXml?: string;
  sourceEntityKind: 'hr.retirement_grant' | 'hr.pension_grant';
  payload: Record<string, unknown>;
}

@Injectable()
export class S2410Builder {
  readonly eventKind = 'S-2410' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildRetirementGrant(
    retirementGrantId: string,
  ): Promise<S2410BuildResult> {
    const rows = await this.databaseService.query<RetirementBenefitRow>(
      `
      SELECT
        grant_row.id::text AS retirement_grant_id,
        grant_row.tenant_id::text,
        employee.id::text AS employee_id,
        employee.registration AS employee_registration,
        employee.cpf AS employee_cpf,
        grant_row.granted_on,
        grant_row.legal_basis,
        grant_row.appointment_act,
        rule.name AS rule_name,
        company.cnpj AS company_cnpj
      FROM hr.retirement_grant grant_row
      JOIN hr.employee employee
        ON employee.tenant_id = grant_row.tenant_id
       AND employee.id = grant_row.employee_id
      JOIN hr.retirement_rule rule
        ON rule.tenant_id = grant_row.tenant_id
       AND rule.id = grant_row.rule_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = grant_row.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE grant_row.id = $1::uuid
      LIMIT 1
      `,
      [retirementGrantId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Retirement benefit grant not found');

    return this.buildXml({
      sourceKind: 'RETIREMENT',
      sourceId: row.retirement_grant_id,
      tenantId: row.tenant_id,
      beneficiaryCpf: beneficiaryCpf(row.employee_cpf, this.eventKind),
      registration: row.employee_registration,
      companyCnpj: row.company_cnpj,
      grantedOn: requiredDate(row.granted_on, 'retirement.granted_on'),
      benefitNumber: s2410BenefitNumber('RET', row.retirement_grant_id),
      benefitType: benefitTypeCode(row.rule_name, '0101'),
      planType: '0',
      description: benefitDescription(
        row.appointment_act,
        row.legal_basis,
        row.rule_name,
      ),
      judicialDecision: judicialDecision(row.legal_basis),
      sourceEntityKind: 'hr.retirement_grant',
      payload: {
        retirementGrantId: row.retirement_grant_id,
        employeeId: row.employee_id,
        cpfBenef: beneficiaryCpf(row.employee_cpf, this.eventKind),
      },
    });
  }

  async buildPensionGrant(pensionGrantId: string): Promise<S2410BuildResult> {
    const rows = await this.databaseService.query<PensionBenefitRow>(
      `
      SELECT
        pension.id::text AS pension_grant_id,
        pension.tenant_id::text,
        employee.id::text AS instituting_employee_id,
        employee.registration AS instituting_registration,
        employee.cpf AS instituting_cpf,
        pension.beneficiary_cpf,
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
    if (!row) throw new NotFoundException('Pension benefit grant not found');

    return this.buildXml({
      sourceKind: 'PENSION',
      sourceId: row.pension_grant_id,
      tenantId: row.tenant_id,
      beneficiaryCpf: beneficiaryCpf(row.beneficiary_cpf, this.eventKind),
      registration: row.instituting_registration,
      companyCnpj: row.company_cnpj,
      grantedOn: requiredDate(row.granted_on, 'pension.granted_on'),
      benefitNumber: s2410BenefitNumber('PEN', row.pension_grant_id),
      benefitType: benefitTypeCode(row.benefit_type, '0601'),
      planType: '0',
      description: benefitDescription(
        row.legal_basis,
        row.nature,
        row.apportionment_type,
      ),
      judicialDecision: judicialDecision(row.legal_basis),
      pensionDeathXml: pensionDeathXml(row.apportionment_type),
      sourceEntityKind: 'hr.pension_grant',
      payload: {
        pensionGrantId: row.pension_grant_id,
        institutingEmployeeId: row.instituting_employee_id,
        cpfBenef: beneficiaryCpf(row.beneficiary_cpf, this.eventKind),
        cpfInstituidor: onlyDigits(row.instituting_cpf),
      },
    });
  }

  private buildXml(data: BenefitData): S2410BuildResult {
    const reference = eventId(this.eventKind, data.tenantId, data.sourceId);
    const registrationXml = data.registration
      ? `<matricula>${benefitRegistration(data.registration)}</matricula>`
      : '';
    const descriptionXml = data.description
      ? `<dsc>${data.description}</dsc>`
      : '';
    const pensionDeathXml = data.pensionDeathXml
      ? `\n        ${data.pensionDeathXml}`
      : '';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtCdBenIn/v_S_01_03_00">
  <evtCdBenIn Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(data.companyCnpj)}</nrInsc></ideEmpregador>
    <beneficiario><cpfBenef>${data.beneficiaryCpf}</cpfBenef>${registrationXml}</beneficiario>
    <infoBenInicio>
      <cadIni>N</cadIni>
      <indSitBenef>1</indSitBenef>
      <nrBeneficio>${data.benefitNumber}</nrBeneficio>
      <dtIniBeneficio>${data.grantedOn}</dtIniBeneficio>
      <dadosBeneficio>
        <tpBeneficio>${data.benefitType}</tpBeneficio>
        <tpPlanRP>${data.planType}</tpPlanRP>
        ${descriptionXml}
        <indDecJud>${data.judicialDecision}</indDecJud>${pensionDeathXml}
      </dadosBeneficio>
    </infoBenInicio>
  </evtCdBenIn>
</eSocial>`;

    return {
      sourceKind: data.sourceKind,
      sourceId: data.sourceId,
      tenantId: data.tenantId,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: data.grantedOn.slice(0, 7),
      sourceEntityKind: data.sourceEntityKind,
      payload: {
        ...data.payload,
        sourceKind: data.sourceKind,
        nrBeneficio: data.benefitNumber,
        tpBeneficio: data.benefitType,
        tpPlanRP: data.planType,
        grantedOn: data.grantedOn,
      },
    };
  }
}

function beneficiaryCpf(value: string | null | undefined, eventKind: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 11) {
    throw new BadRequestException(
      `${eventKind} beneficiary CPF must have 11 digits`,
    );
  }
  return digits;
}

function benefitRegistration(value: string): string {
  const cleaned = cleanText(value, 'MATRICULA').slice(0, 30);
  if (!cleaned.trim()) {
    throw new BadRequestException('S-2410 benefit registration is required');
  }
  return cleaned;
}

export function s2410BenefitNumber(
  prefix: 'RET' | 'PEN',
  sourceId: string,
): string {
  const digits = onlyDigits(sourceId).slice(-17).padStart(17, '0');
  return `${prefix}${digits}`;
}

function benefitTypeCode(value: string | null | undefined, fallback: string) {
  const direct = onlyDigits(value);
  if (direct.length === 4) return direct;
  return fallback;
}

function benefitDescription(...values: Array<string | null | undefined>) {
  return cleanText(values.filter(Boolean).join(' - '), '').slice(0, 255);
}

function judicialDecision(value: string): 'S' | 'N' {
  return /judicial|processo|senten[cç]a/i.test(value) ? 'S' : 'N';
}

function pensionDeathXml(apportionmentType: string): string {
  const normalized = apportionmentType.toLowerCase();
  const type = normalized.includes('tempor') ? '2' : '1';
  return `<infoPenMorte><tpPenMorte>${type}</tpPenMorte></infoPenMorte>`;
}

function requiredDate(
  value: Date | string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new BadRequestException(`S-2410 ${field} is required`);
  }
  return dateOnly(value);
}

function eventId(
  eventKind: 'S-2410',
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
