import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, onlyDigits, sha256 } from './s1xxx-common';
import { addressXml, cleanText, dateOnly } from './s22xx-common';

export interface S2405BuildResult {
  recertificationRecordId: string;
  retirementGrantId: string;
  tenantId: string;
  employeeId: string;
  eventKind: 'S-2405';
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface RetirementBeneficiaryChangeRow extends QueryResultRow {
  recertification_record_id: string;
  retirement_grant_id: string;
  tenant_id: string;
  employee_id: string;
  granted_on: Date | string;
  recertified_on: Date | string;
  employee_name: string;
  employee_cpf: string | null;
  employee_gender: string;
  employee_marital_status: string | null;
  employee_address: unknown;
  company_cnpj: string | null;
}

@Injectable()
export class S2405Builder {
  readonly eventKind = 'S-2405' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(recertificationRecordId: string): Promise<S2405BuildResult> {
    const rows =
      await this.databaseService.query<RetirementBeneficiaryChangeRow>(
        `
        SELECT
          record.id::text AS recertification_record_id,
          grant_row.id::text AS retirement_grant_id,
          employee.tenant_id::text,
          employee.id::text AS employee_id,
          grant_row.granted_on,
          record.recertified_on,
          employee.name AS employee_name,
          employee.cpf AS employee_cpf,
          employee.gender::text AS employee_gender,
          employee.marital_status AS employee_marital_status,
          employee.address AS employee_address,
          company.cnpj AS company_cnpj
        FROM hr.recertification_record record
        JOIN hr.recertification_beneficiary beneficiary
          ON beneficiary.id = record.beneficiary_id
         AND beneficiary.type = 'RETIREE'::"RecertificationBeneficiaryType"
        JOIN hr.employee employee
          ON employee.id = beneficiary.employee_id
        JOIN LATERAL (
          SELECT grant_row.id, grant_row.granted_on
          FROM hr.retirement_grant grant_row
          WHERE grant_row.tenant_id = employee.tenant_id
            AND grant_row.employee_id = employee.id
            AND grant_row.status = 'CONCEDIDA'
          ORDER BY grant_row.granted_on DESC, grant_row.created_at DESC
          LIMIT 1
        ) grant_row ON true
        LEFT JOIN LATERAL (
          SELECT cnpj
          FROM hr.company
          WHERE tenant_id = employee.tenant_id
            AND status = 'ACTIVE'::"RecordStatus"
          ORDER BY code
          LIMIT 1
        ) company ON true
        WHERE record.id = $1::uuid
        LIMIT 1
        `,
        [recertificationRecordId],
      );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(
        'RPPS retirement beneficiary change not found',
      );
    }

    const cpf = cpfBenef(row.employee_cpf);
    const alterationDate = requiredDate(row.recertified_on, 'recertified_on');
    const startDate = requiredDate(row.granted_on, 'retirement.granted_on');
    if (alterationDate <= startDate) {
      throw new BadRequestException(
        'S-2405 alteration date must be after S-2400 start date',
      );
    }

    const reference = eventId(
      this.eventKind,
      row.tenant_id,
      row.recertification_record_id,
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtCdBenefAlt/v_S_01_03_00">
  <evtCdBenefAlt Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(row.company_cnpj)}</nrInsc></ideEmpregador>
    <ideBenef><cpfBenef>${cpf}</cpfBenef></ideBenef>
    <alteracao>
      <dtAlteracao>${alterationDate}</dtAlteracao>
      <dadosBenef>
        <nmBenefic>${beneficiaryName(row.employee_name)}</nmBenefic>
        <sexo>${gender(row.employee_gender)}</sexo>
        <racaCor>1</racaCor>
        ${maritalStatusXml(row.employee_marital_status)}
        <incFisMen>N</incFisMen>
        ${addressXml(row.employee_address)}
      </dadosBenef>
    </alteracao>
  </evtCdBenefAlt>
</eSocial>`;

    return {
      recertificationRecordId: row.recertification_record_id,
      retirementGrantId: row.retirement_grant_id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: alterationDate.slice(0, 7),
      payload: {
        recertificationRecordId: row.recertification_record_id,
        retirementGrantId: row.retirement_grant_id,
        employeeId: row.employee_id,
        cpfBenef: cpf,
        alterationDate,
      },
    };
  }
}

function cpfBenef(value: string | null | undefined): string {
  const digits = onlyDigits(value);
  if (digits.length !== 11) {
    throw new BadRequestException('S-2405 beneficiary CPF must have 11 digits');
  }
  return digits;
}

function beneficiaryName(value: string): string {
  return cleanText(value, 'Beneficiario RPPS').slice(0, 70);
}

function gender(value: string): string {
  if (value === 'FEMALE') return 'F';
  if (value === 'MALE') return 'M';
  throw new BadRequestException('S-2405 beneficiary gender is required');
}

function maritalStatusXml(value: string | null): string {
  const status = onlyDigits(value);
  return /^[1-5]$/.test(status) ? `<estCiv>${status}</estCiv>` : '';
}

function requiredDate(
  value: Date | string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new BadRequestException(`S-2405 ${field} is required`);
  }
  return dateOnly(value);
}

function eventId(
  eventKind: 'S-2405',
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
