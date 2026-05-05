import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, onlyDigits, sha256 } from './s1xxx-common';
import { dateOnly } from './s22xx-common';
import { s2410BenefitNumber } from './s2410.builder';

export type S2420BenefitSourceKind = 'PENSION';

export interface S2420BuildResult {
  sourceKind: S2420BenefitSourceKind;
  sourceId: string;
  tenantId: string;
  eventKind: 'S-2420';
  xml: string;
  reference: string;
  competence: string;
  sourceEntityKind: 'hr.pension_grant';
  payload: Record<string, unknown>;
}

interface PensionTerminationRow extends QueryResultRow {
  pension_grant_id: string;
  tenant_id: string;
  beneficiary_cpf: string | null;
  granted_on: Date | string;
  ceased_on: Date | string | null;
  company_cnpj: string | null;
}

interface TerminationData {
  sourceKind: S2420BenefitSourceKind;
  sourceId: string;
  tenantId: string;
  beneficiaryCpf: string;
  companyCnpj: string | null;
  benefitNumber: string;
  grantedOn: string;
  terminatedOn: string;
  terminationReason: string;
  sourceEntityKind: 'hr.pension_grant';
  payload: Record<string, unknown>;
}

@Injectable()
export class S2420Builder {
  readonly eventKind = 'S-2420' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildPensionGrant(pensionGrantId: string): Promise<S2420BuildResult> {
    const rows = await this.databaseService.query<PensionTerminationRow>(
      `
      SELECT
        pension.id::text AS pension_grant_id,
        pension.tenant_id::text,
        pension.beneficiary_cpf,
        pension.granted_on,
        pension.ceased_on,
        company.cnpj AS company_cnpj
      FROM hr.pension_grant pension
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

    const grantedOn = requiredDate(row.granted_on, 'pension.granted_on');
    const terminatedOn = requiredDate(row.ceased_on, 'pension.ceased_on');
    if (terminatedOn < grantedOn) {
      throw new BadRequestException(
        'S-2420 termination date must be on or after the S-2410 benefit start date',
      );
    }

    return this.buildXml({
      sourceKind: 'PENSION',
      sourceId: row.pension_grant_id,
      tenantId: row.tenant_id,
      beneficiaryCpf: beneficiaryCpf(row.beneficiary_cpf, this.eventKind),
      companyCnpj: row.company_cnpj,
      benefitNumber: s2410BenefitNumber('PEN', row.pension_grant_id),
      grantedOn,
      terminatedOn,
      terminationReason: '05',
      sourceEntityKind: 'hr.pension_grant',
      payload: {
        pensionGrantId: row.pension_grant_id,
        cpfBenef: beneficiaryCpf(row.beneficiary_cpf, this.eventKind),
      },
    });
  }

  private buildXml(data: TerminationData): S2420BuildResult {
    const reference = eventId(this.eventKind, data.tenantId, data.sourceId);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtCdBenTerm/v_S_01_03_00">
  <evtCdBenTerm Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(data.companyCnpj)}</nrInsc></ideEmpregador>
    <ideBeneficio><cpfBenef>${data.beneficiaryCpf}</cpfBenef><nrBeneficio>${data.benefitNumber}</nrBeneficio></ideBeneficio>
    <infoBenTermino>
      <dtTermBeneficio>${data.terminatedOn}</dtTermBeneficio>
      <mtvTermino>${data.terminationReason}</mtvTermino>
    </infoBenTermino>
  </evtCdBenTerm>
</eSocial>`;

    return {
      sourceKind: data.sourceKind,
      sourceId: data.sourceId,
      tenantId: data.tenantId,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: data.terminatedOn.slice(0, 7),
      sourceEntityKind: data.sourceEntityKind,
      payload: {
        ...data.payload,
        sourceKind: data.sourceKind,
        nrBeneficio: data.benefitNumber,
        grantedOn: data.grantedOn,
        terminatedOn: data.terminatedOn,
        mtvTermino: data.terminationReason,
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

function requiredDate(
  value: Date | string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new BadRequestException(`S-2420 ${field} is required`);
  }
  return dateOnly(value);
}

function eventId(
  eventKind: 'S-2420',
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
