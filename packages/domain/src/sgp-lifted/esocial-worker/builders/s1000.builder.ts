import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  employerRegistration,
  eventId,
  ideEvento,
  S1xxxBuilder,
  S1xxxSourceRecord,
} from './s1xxx-common';

interface EmployerRow extends QueryResultRow {
  id: string;
  cnpj: string | null;
}

@Injectable()
export class S1000Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1000' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<EmployerRow>(
      `
      SELECT COALESCE(company.id::text, tenant.id::text) AS id, company.cnpj
      FROM public.tenant tenant
      LEFT JOIN LATERAL (
        SELECT id, cnpj
        FROM hr.company
        WHERE tenant_id = tenant.id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE tenant.id = $1::uuid
      `,
      [tenantId],
    );
    const row = rows[0] ?? { id: tenantId, cnpj: null };
    const nrInsc = employerRegistration(row.cnpj);
    const id = eventId(this.eventKind, tenantId, row.id);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00">
  <evtInfoEmpregador Id="${id}">
    ${ideEvento()}
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${nrInsc}</nrInsc></ideEmpregador>
    <infoEmpregador>
      <inclusao>
        <idePeriodo><iniValid>${competence}</iniValid></idePeriodo>
        <infoCadastro>
          <classTrib>85</classTrib>
          <indCoop>0</indCoop>
          <indConstr>0</indConstr>
          <indDesFolha>0</indDesFolha>
          <indOptRegEletron>0</indOptRegEletron>
        </infoCadastro>
      </inclusao>
    </infoEmpregador>
  </evtInfoEmpregador>
</eSocial>`;
    return [
      {
        id: row.id,
        sourceEntityKind: 'hr.company',
        xml,
        reference: id,
        competence,
        payload: { cnpjRoot: nrInsc },
      },
    ];
  }
}
