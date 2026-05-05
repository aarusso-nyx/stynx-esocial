import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  eventId,
  fullRegistration,
  ideEmpregador,
  ideEvento,
  S1xxxBuilder,
  S1xxxSourceRecord,
  xmlEscape,
} from './s1xxx-common';

interface WorkEnvironmentRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  branch_cnpj: string | null;
  company_cnpj: string | null;
}

@Injectable()
export class S1060Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1060' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<WorkEnvironmentRow>(
      `
      SELECT
        wl.id::text,
        wl.code,
        wl.name,
        wl.description,
        branch.cnpj AS branch_cnpj,
        company.cnpj AS company_cnpj
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
              id: `${tenantId}:ambiente`,
              code: 'AMB01',
              name: 'Ambiente operacional',
              description: 'Ambiente de trabalho padrao SGP',
              branch_cnpj: '12345678000199',
              company_cnpj: '12345678000199',
            },
          ];

    return sourceRows.map((row) => {
      const id = eventId(this.eventKind, tenantId, row.id);
      const registration = fullRegistration(
        row.branch_cnpj ?? row.company_cnpj,
      );
      const code = ambienteCode(row.code);
      const name = xmlEscape(row.name || code).slice(0, 100);
      const description = xmlEscape(
        row.description?.trim() || row.name || 'Ambiente de trabalho SGP',
      ).slice(0, 8000);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabAmbiente/v02_05_00">
  <evtTabAmbiente Id="${id}">
    ${ideEvento()}
    ${ideEmpregador(registration)}
    <infoAmbiente>
      <inclusao>
        <ideAmbiente><codAmb>${code}</codAmb><iniValid>${competence}</iniValid></ideAmbiente>
        <dadosAmbiente><nmAmb>${name}</nmAmb><dscAmb>${description}</dscAmb><localAmb>1</localAmb><tpInsc>1</tpInsc><nrInsc>${registration}</nrInsc></dadosAmbiente>
      </inclusao>
    </infoAmbiente>
  </evtTabAmbiente>
</eSocial>`;
      return {
        id: row.id,
        sourceEntityKind: 'hr.work_location',
        xml,
        reference: id,
        competence,
        payload: {
          code,
          workEnvironmentCode: code,
          workLocationId: row.id,
        },
      };
    });
  }
}

function ambienteCode(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '-').toUpperCase();
  return xmlEscape(normalized || 'AMB01').slice(0, 30);
}
