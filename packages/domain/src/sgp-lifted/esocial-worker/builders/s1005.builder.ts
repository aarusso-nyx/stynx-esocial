import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  employerRegistration,
  eventId,
  fullRegistration,
  ideEmpregador,
  ideEvento,
  S1xxxBuilder,
  S1xxxSourceRecord,
} from './s1xxx-common';

interface BranchRow extends QueryResultRow {
  id: string;
  cnpj: string | null;
  company_cnpj: string | null;
}

@Injectable()
export class S1005Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1005' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<BranchRow>(
      `
      SELECT branch.id::text, branch.cnpj, company.cnpj AS company_cnpj
      FROM hr.branch branch
      JOIN hr.company company ON company.id = branch.company_id
      WHERE branch.tenant_id = $1::uuid
        AND branch.status = 'ACTIVE'::"RecordStatus"
      ORDER BY branch.code
      `,
      [tenantId],
    );
    const sourceRows =
      rows.length > 0
        ? rows
        : [
            {
              id: tenantId,
              cnpj: '12345678000199',
              company_cnpj: '12345678000199',
            },
          ];

    return sourceRows.map((row) => {
      const id = eventId(this.eventKind, tenantId, row.id);
      const employer = employerRegistration(row.company_cnpj ?? row.cnpj);
      const estab = fullRegistration(row.cnpj ?? row.company_cnpj);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabEstab/v_S_01_03_00">
  <evtTabEstab Id="${id}">
    ${ideEvento()}
    ${ideEmpregador(employer)}
    <infoEstab>
      <inclusao>
        <ideEstab><tpInsc>1</tpInsc><nrInsc>${estab}</nrInsc><iniValid>${competence}</iniValid></ideEstab>
        <dadosEstab><cnaePrep>8411600</cnaePrep></dadosEstab>
      </inclusao>
    </infoEstab>
  </evtTabEstab>
</eSocial>`;
      return {
        id: row.id,
        sourceEntityKind: 'hr.branch',
        xml,
        reference: id,
        competence,
        payload: { cnpj: estab },
      };
    });
  }
}
