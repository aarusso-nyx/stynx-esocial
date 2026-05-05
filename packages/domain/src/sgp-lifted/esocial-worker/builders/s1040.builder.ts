import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  employerRegistration,
  eventId,
  ideEmpregador,
  ideEvento,
  S1xxxBuilder,
  S1xxxSourceRecord,
  xmlEscape,
} from './s1xxx-common';

interface JobFunctionRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  cnpj: string | null;
}

@Injectable()
export class S1040Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1040' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<JobFunctionRow>(
      `
      SELECT
        job_function.id::text,
        job_function.code,
        job_function.name,
        company.cnpj
      FROM hr.job_function job_function
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = job_function.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE job_function.tenant_id = $1::uuid
        AND job_function.status = 'ACTIVE'::"RecordStatus"
      ORDER BY job_function.code
      `,
      [tenantId],
    );
    const sourceRows =
      rows.length > 0
        ? rows
        : [
            {
              id: `${tenantId}:funcao`,
              code: 'FUNC01',
              name: 'Funcao comissionada',
              cnpj: '12345678000199',
            },
          ];

    return sourceRows.map((row) => {
      const id = eventId(this.eventKind, tenantId, row.id);
      const employer = employerRegistration(row.cnpj);
      const code = xmlEscape(row.code).slice(0, 30);
      const description = xmlEscape(row.name).slice(0, 100);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabFuncao/v_S_01_03_00">
  <evtTabFuncao Id="${id}">
    ${ideEvento()}
    ${ideEmpregador(employer)}
    <infoFuncao>
      <inclusao>
        <ideFuncao><codFuncao>${code}</codFuncao><iniValid>${competence}</iniValid></ideFuncao>
        <dadosFuncao><dscFuncao>${description}</dscFuncao></dadosFuncao>
      </inclusao>
    </infoFuncao>
  </evtTabFuncao>
</eSocial>`;
      return {
        id: row.id,
        sourceEntityKind: 'hr.job_function',
        xml,
        reference: id,
        competence,
        payload: { code: row.code },
      };
    });
  }
}
