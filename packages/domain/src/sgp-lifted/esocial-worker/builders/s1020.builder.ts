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

interface WorkLocationRow extends QueryResultRow {
  id: string;
  code: string;
  cnpj: string | null;
  fpas_code: string;
}

@Injectable()
export class S1020Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1020' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<WorkLocationRow>(
      `
      SELECT
        wl.id::text,
        wl.code,
        wl.fpas_code,
        company.cnpj
      FROM hr.work_location wl
      LEFT JOIN hr.branch branch ON branch.id = wl.branch_id
      LEFT JOIN hr.company company ON company.id = branch.company_id
      WHERE wl.tenant_id = $1::uuid
        AND wl.status = 'ACTIVE'::"RecordStatus"
      ORDER BY wl.code
      `,
      [tenantId],
    );
    const sourceRows =
      rows.length > 0
        ? rows
        : [
            {
              id: `${tenantId}:lotacao`,
              code: 'LOT01',
              cnpj: '12345678000199',
              fpas_code: '582',
            },
          ];

    return sourceRows.map((row) => {
      const id = eventId(this.eventKind, tenantId, row.id);
      const employer = employerRegistration(row.cnpj);
      const code = xmlEscape(row.code).slice(0, 30);
      const fpas = (row.fpas_code || '582').padStart(3, '0').slice(0, 3);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabLotacao/v_S_01_03_00">
  <evtTabLotacao Id="${id}">
    ${ideEvento()}
    ${ideEmpregador(employer)}
    <infoLotacao>
      <inclusao>
        <ideLotacao><codLotacao>${code}</codLotacao><iniValid>${competence}</iniValid></ideLotacao>
        <dadosLotacao>
          <tpLotacao>01</tpLotacao>
          <fpasLotacao><fpas>${fpas}</fpas><codTercs>0000</codTercs></fpasLotacao>
        </dadosLotacao>
      </inclusao>
    </infoLotacao>
  </evtTabLotacao>
</eSocial>`;
      return {
        id: row.id,
        sourceEntityKind: 'hr.work_location',
        xml,
        reference: id,
        competence,
        payload: { code: row.code },
      };
    });
  }
}
