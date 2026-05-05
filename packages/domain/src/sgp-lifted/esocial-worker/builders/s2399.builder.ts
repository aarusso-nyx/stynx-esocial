import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { employerRegistration, sha256 } from './s1xxx-common';
import { cleanText, cpf, dateOnly, ideEmpregadorXml } from './s22xx-common';

export interface S2399BuildResult {
  contractId: string;
  tenantId: string;
  employeeId: string;
  eventKind: 'S-2399';
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface TsvTerminationRow extends QueryResultRow {
  contract_id: string;
  tenant_id: string;
  tsv_category: string;
  end_date: Date | string | null;
  employee_id: string;
  employee_registration: string;
  employee_cpf: string | null;
  employee_terminated_on: Date | string | null;
  company_cnpj: string | null;
}

@Injectable()
export class S2399Builder {
  readonly eventKind = 'S-2399' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(contractId: string): Promise<S2399BuildResult> {
    const rows = await this.databaseService.query<TsvTerminationRow>(
      `
      SELECT
        tc.id::text AS contract_id,
        tc.tenant_id::text,
        tc.tsv_category,
        tc.end_date,
        e.id::text AS employee_id,
        e.registration AS employee_registration,
        e.cpf AS employee_cpf,
        e.terminated_on AS employee_terminated_on,
        company.cnpj AS company_cnpj
      FROM hr.tsv_contract tc
      JOIN hr.employment_link el
        ON el.tenant_id = tc.tenant_id
       AND el.id = tc.employment_link_id
      JOIN hr.employee e
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
      WHERE tc.id = $1::uuid
      LIMIT 1
      `,
      [contractId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('TS-V contract not found');

    const terminationDate = dateOnly(
      row.end_date ?? row.employee_terminated_on,
    );
    if (terminationDate === '2000-01-01') {
      throw new BadRequestException('S-2399 requires TS-V termination date');
    }

    const category = tsvCategory(row.tsv_category);
    const reference = eventId(this.eventKind, row.tenant_id, row.contract_id);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTSVTermino/v_S_01_03_00">
  <evtTSVTermino Id="${reference}">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    ${ideEmpregadorXml(row.company_cnpj)}
    <ideTrabSemVinculo><cpfTrab>${cpf(row.employee_cpf)}</cpfTrab><matricula>${cleanText(row.employee_registration, row.contract_id).slice(0, 30)}</matricula></ideTrabSemVinculo>
    <infoTSVTermino>
      <dtTerm>${terminationDate}</dtTerm>
    </infoTSVTermino>
  </evtTSVTermino>
</eSocial>`;

    return {
      contractId: row.contract_id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: terminationDate.slice(0, 7),
      payload: {
        tsvContractId: row.contract_id,
        tsvCategory: category,
        registration: row.employee_registration,
        terminationDate,
        employerBaseRegistration: employerRegistration(row.company_cnpj),
      },
    };
  }
}

function tsvCategory(value: string): string {
  const category = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 3);
  if (!/^\d{3}$/.test(category)) {
    throw new BadRequestException('TS-V contract category must have 3 digits');
  }
  return category;
}

function eventId(
  eventKind: 'S-2399',
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
