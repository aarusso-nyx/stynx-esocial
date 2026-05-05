import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, onlyDigits, sha256 } from './s1xxx-common';
import { addressXml, cleanText, dateOnly } from './s22xx-common';

export interface S2400BuildResult {
  retirementGrantId: string;
  tenantId: string;
  employeeId: string;
  eventKind: 'S-2400';
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface RetirementBeneficiaryRow extends QueryResultRow {
  retirement_grant_id: string;
  tenant_id: string;
  employee_id: string;
  granted_on: Date | string;
  employee_name: string;
  employee_cpf: string | null;
  employee_birth_date: Date | string | null;
  employee_gender: string;
  employee_marital_status: string | null;
  employee_address: unknown;
  company_cnpj: string | null;
}

interface DependentRow extends QueryResultRow {
  name: string;
  cpf: string | null;
  birth_date: Date | string | null;
  relationship: string;
  income_tax_dependent: boolean;
}

@Injectable()
export class S2400Builder {
  readonly eventKind = 'S-2400' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(retirementGrantId: string): Promise<S2400BuildResult> {
    const rows = await this.databaseService.query<RetirementBeneficiaryRow>(
      `
      SELECT
        grant_row.id::text AS retirement_grant_id,
        grant_row.tenant_id::text,
        employee.id::text AS employee_id,
        grant_row.granted_on,
        employee.name AS employee_name,
        employee.cpf AS employee_cpf,
        employee.birth_date AS employee_birth_date,
        employee.gender::text AS employee_gender,
        employee.marital_status AS employee_marital_status,
        employee.address AS employee_address,
        company.cnpj AS company_cnpj
      FROM hr.retirement_grant grant_row
      JOIN hr.employee employee
        ON employee.tenant_id = grant_row.tenant_id
       AND employee.id = grant_row.employee_id
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
    if (!row) throw new NotFoundException('Retirement grant not found');

    const dependents = await this.databaseService.query<DependentRow>(
      `
      SELECT name, cpf, birth_date, relationship, income_tax_dependent
      FROM hr.employee_dependent
      WHERE tenant_id = $1::uuid
        AND employee_id = $2::uuid
      ORDER BY birth_date NULLS LAST, name
      `,
      [row.tenant_id, row.employee_id],
    );

    const reference = eventId(
      this.eventKind,
      row.tenant_id,
      row.retirement_grant_id,
    );
    const startDate = requiredDate(row.granted_on, 'granted_on');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtCdBenefIn/v_S_01_03_00">
  <evtCdBenefIn Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(row.company_cnpj)}</nrInsc></ideEmpregador>
    <beneficiario>
      <cpfBenef>${cpfBenef(row.employee_cpf)}</cpfBenef>
      <nmBenefic>${beneficiaryName(row.employee_name)}</nmBenefic>
      <dtNascto>${requiredDate(row.employee_birth_date, 'employee.birth_date')}</dtNascto>
      <dtInicio>${startDate}</dtInicio>
      ${genderXml(row.employee_gender)}
      <racaCor>1</racaCor>
      ${maritalStatusXml(row.employee_marital_status)}
      <incFisMen>N</incFisMen>
      ${addressXml(row.employee_address)}
      ${dependents.map(dependentXml).join('\n      ')}
    </beneficiario>
  </evtCdBenefIn>
</eSocial>`;

    return {
      retirementGrantId: row.retirement_grant_id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: startDate.slice(0, 7),
      payload: {
        retirementGrantId: row.retirement_grant_id,
        employeeId: row.employee_id,
        cpfBenef: cpfBenef(row.employee_cpf),
        dependentCount: dependents.length,
      },
    };
  }
}

function cpfBenef(value: string | null | undefined): string {
  const digits = onlyDigits(value);
  if (digits.length !== 11) {
    throw new BadRequestException('S-2400 beneficiary CPF must have 11 digits');
  }
  return digits;
}

function beneficiaryName(value: string): string {
  return cleanText(value, 'Beneficiario RPPS').slice(0, 70);
}

function genderXml(value: string): string {
  if (value === 'FEMALE') return '<sexo>F</sexo>';
  if (value === 'MALE') return '<sexo>M</sexo>';
  throw new BadRequestException('S-2400 beneficiary gender is required');
}

function maritalStatusXml(value: string | null): string {
  const status = onlyDigits(value);
  return /^[1-5]$/.test(status) ? `<estCiv>${status}</estCiv>` : '';
}

function dependentXml(dependent: DependentRow): string {
  const depCpf = onlyDigits(dependent.cpf);
  const cpfXml = depCpf.length === 11 ? `<cpfDep>${depCpf}</cpfDep>` : '';
  return `<dependente><tpDep>${dependentType(dependent.relationship)}</tpDep><nmDep>${cleanText(
    dependent.name,
    'Dependente',
  ).slice(0, 70)}</nmDep><dtNascto>${requiredDate(
    dependent.birth_date,
    'dependent.birth_date',
  )}</dtNascto>${cpfXml}<depIRRF>${
    dependent.income_tax_dependent ? 'S' : 'N'
  }</depIRRF><incFisMen>N</incFisMen></dependente>`;
}

function dependentType(relationship: string | null | undefined): string {
  const normalized = String(relationship ?? '').toLowerCase();
  if (normalized.includes('filh')) return '03';
  if (normalized.includes('conju')) return '01';
  return '99';
}

function requiredDate(
  value: Date | string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new BadRequestException(`S-2400 ${field} is required`);
  }
  return dateOnly(value);
}

function eventId(
  eventKind: 'S-2400',
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
