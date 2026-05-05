import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, onlyDigits, sha256 } from './s1xxx-common';
import { s2410BenefitNumber, S2410BenefitSourceKind } from './s2410.builder';
import { dateOnly } from './s22xx-common';

export interface S2418BuildInput {
  sourceId: string;
  effectiveReactivationOn: Date | string;
  financialEffectOn: Date | string;
}

export interface S2418BuildResult {
  sourceKind: S2410BenefitSourceKind;
  sourceId: string;
  tenantId: string;
  eventKind: 'S-2418';
  xml: string;
  reference: string;
  competence: string;
  sourceEntityKind: 'hr.retirement_grant' | 'hr.pension_grant';
  payload: Record<string, unknown>;
}

interface RetirementReactivationRow extends QueryResultRow {
  retirement_grant_id: string;
  tenant_id: string;
  employee_id: string;
  employee_cpf: string | null;
  status: string;
  company_cnpj: string | null;
}

interface PensionReactivationRow extends QueryResultRow {
  pension_grant_id: string;
  tenant_id: string;
  instituting_employee_id: string | null;
  beneficiary_cpf: string | null;
  ceased_on: Date | string | null;
  company_cnpj: string | null;
}

interface ReactivationData {
  sourceKind: S2410BenefitSourceKind;
  sourceId: string;
  tenantId: string;
  beneficiaryCpf: string;
  companyCnpj: string | null;
  benefitNumber: string;
  effectiveReactivationOn: string;
  financialEffectOn: string;
  previousCessationOn?: string;
  sourceStatus?: string;
  sourceEntityKind: 'hr.retirement_grant' | 'hr.pension_grant';
  payload: Record<string, unknown>;
}

@Injectable()
export class S2418Builder {
  readonly eventKind = 'S-2418' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildRetirementReactivation(
    input: S2418BuildInput,
  ): Promise<S2418BuildResult> {
    const rows = await this.databaseService.query<RetirementReactivationRow>(
      `
      SELECT
        grant_row.id::text AS retirement_grant_id,
        grant_row.tenant_id::text,
        employee.id::text AS employee_id,
        employee.cpf AS employee_cpf,
        grant_row.status,
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
      [input.sourceId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Retirement benefit grant not found');

    const sourceStatus = row.status.toUpperCase();
    if (sourceStatus === 'CONCEDIDA' || sourceStatus === 'ACTIVE') {
      throw new BadRequestException(
        'S-2418 retirement benefit must be suspended or ceased before reactivation',
      );
    }

    return this.buildXml({
      sourceKind: 'RETIREMENT',
      sourceId: row.retirement_grant_id,
      tenantId: row.tenant_id,
      beneficiaryCpf: beneficiaryCpf(row.employee_cpf, this.eventKind),
      companyCnpj: row.company_cnpj,
      benefitNumber: s2410BenefitNumber('RET', row.retirement_grant_id),
      sourceStatus: row.status,
      sourceEntityKind: 'hr.retirement_grant',
      payload: {
        retirementGrantId: row.retirement_grant_id,
        employeeId: row.employee_id,
      },
      ...reactivationDates(
        input.effectiveReactivationOn,
        input.financialEffectOn,
        undefined,
        this.eventKind,
      ),
    });
  }

  async buildPensionReactivation(
    input: S2418BuildInput,
  ): Promise<S2418BuildResult> {
    const rows = await this.databaseService.query<PensionReactivationRow>(
      `
      SELECT
        pension.id::text AS pension_grant_id,
        pension.tenant_id::text,
        employee.id::text AS instituting_employee_id,
        pension.beneficiary_cpf,
        pension.ceased_on,
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
      [input.sourceId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Pension benefit grant not found');
    if (!row.ceased_on) {
      throw new BadRequestException(
        'S-2418 pension benefit must have a cessation date before reactivation',
      );
    }

    return this.buildXml({
      sourceKind: 'PENSION',
      sourceId: row.pension_grant_id,
      tenantId: row.tenant_id,
      beneficiaryCpf: beneficiaryCpf(row.beneficiary_cpf, this.eventKind),
      companyCnpj: row.company_cnpj,
      benefitNumber: s2410BenefitNumber('PEN', row.pension_grant_id),
      previousCessationOn: dateOnly(row.ceased_on),
      sourceEntityKind: 'hr.pension_grant',
      payload: {
        pensionGrantId: row.pension_grant_id,
        institutingEmployeeId: row.instituting_employee_id,
      },
      ...reactivationDates(
        input.effectiveReactivationOn,
        input.financialEffectOn,
        row.ceased_on,
        this.eventKind,
      ),
    });
  }

  private buildXml(data: ReactivationData): S2418BuildResult {
    const reference = eventId(
      this.eventKind,
      data.tenantId,
      data.sourceId,
      data.effectiveReactivationOn,
      data.financialEffectOn,
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtReativBen/v_S_01_03_00">
  <evtReativBen Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(data.companyCnpj)}</nrInsc></ideEmpregador>
    <ideBeneficio><cpfBenef>${data.beneficiaryCpf}</cpfBenef><nrBeneficio>${data.benefitNumber}</nrBeneficio></ideBeneficio>
    <infoReativ>
      <dtEfetReativ>${data.effectiveReactivationOn}</dtEfetReativ>
      <dtEfeito>${data.financialEffectOn}</dtEfeito>
    </infoReativ>
  </evtReativBen>
</eSocial>`;

    return {
      sourceKind: data.sourceKind,
      sourceId: data.sourceId,
      tenantId: data.tenantId,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: data.effectiveReactivationOn.slice(0, 7),
      sourceEntityKind: data.sourceEntityKind,
      payload: {
        ...data.payload,
        sourceKind: data.sourceKind,
        cpfBenef: data.beneficiaryCpf,
        nrBeneficio: data.benefitNumber,
        dtEfetReativ: data.effectiveReactivationOn,
        dtEfeito: data.financialEffectOn,
        previousCessationOn: data.previousCessationOn,
        sourceStatus: data.sourceStatus,
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

function reactivationDates(
  effectiveReactivationOn: Date | string | null | undefined,
  financialEffectOn: Date | string | null | undefined,
  previousCessationOn: Date | string | null | undefined,
  eventKind: string,
) {
  const reactivatedOn = requiredDate(
    effectiveReactivationOn,
    'effectiveReactivationOn',
    eventKind,
  );
  const effectOn = requiredDate(
    financialEffectOn,
    'financialEffectOn',
    eventKind,
  );
  if (effectOn > reactivatedOn) {
    throw new BadRequestException(
      `${eventKind} financial effect date must be on or before effective reactivation date`,
    );
  }
  if (previousCessationOn) {
    const ceasedOn = dateOnly(previousCessationOn);
    if (reactivatedOn <= ceasedOn || effectOn <= ceasedOn) {
      throw new BadRequestException(
        `${eventKind} reactivation dates must be after benefit cessation date`,
      );
    }
  }
  return {
    effectiveReactivationOn: reactivatedOn,
    financialEffectOn: effectOn,
  };
}

function requiredDate(
  value: Date | string | null | undefined,
  field: string,
  eventKind: string,
): string {
  if (!value) {
    throw new BadRequestException(`${eventKind} ${field} is required`);
  }
  return dateOnly(value);
}

function eventId(
  eventKind: 'S-2418',
  tenantId: string,
  sourceId: string,
  effectiveReactivationOn: string,
  financialEffectOn: string,
): string {
  const digits = sha256(
    `${eventKind}:${tenantId}:${sourceId}:${effectiveReactivationOn}:${financialEffectOn}`,
  )
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
