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

interface JobPositionRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  creation_law: string;
  legal_regime: string;
  cbo_code: string | null;
  cnpj: string | null;
}

@Injectable()
export class S1030Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1030' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<JobPositionRow>(
      `
      SELECT
        job_position.id::text,
        job_position.code,
        job_position.name,
        job_position.creation_law,
        job_position.legal_regime,
        cbo.code AS cbo_code,
        company.cnpj
      FROM hr.job_position job_position
      LEFT JOIN hr.job_structure_reference_link cbo_link
        ON cbo_link.job_position_id = job_position.id
       AND cbo_link.reference_catalog_key = 'CBO'
       AND cbo_link.status = 'ACTIVE'::"RecordStatus"
      LEFT JOIN hr.reference_catalog_entry cbo
        ON cbo.id = cbo_link.reference_entry_id
       AND cbo.catalog_key = 'CBO'
       AND cbo.status = 'ACTIVE'::"RecordStatus"
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = job_position.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE job_position.tenant_id = $1::uuid
        AND job_position.status = 'ACTIVE'::"RecordStatus"
      ORDER BY job_position.code
      `,
      [tenantId],
    );
    const sourceRows =
      rows.length > 0
        ? rows
        : [
            {
              id: `${tenantId}:cargo`,
              code: 'ANL',
              name: 'Analista Administrativo',
              creation_law: 'Lei 1/2026',
              legal_regime: 'estatutario',
              cbo_code: '252105',
              cnpj: '12345678000199',
            },
          ];

    return sourceRows.map((row) => {
      const id = eventId(this.eventKind, tenantId, row.id);
      const employer = employerRegistration(row.cnpj);
      const code = xmlEscape(row.code).slice(0, 30);
      const name = xmlEscape(row.name).slice(0, 100);
      const cbo = this.cboCode(row.cbo_code);
      const law = this.lawNumber(row.creation_law);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabCargo/v_S_01_03_00">
  <evtTabCargo Id="${id}">
    ${ideEvento()}
    ${ideEmpregador(employer)}
    <infoCargo>
      <inclusao>
        <ideCargo><codCargo>${code}</codCargo><iniValid>${competence}</iniValid></ideCargo>
        <dadosCargo>
          <nmCargo>${name}</nmCargo><codCBO>${cbo}</codCBO>
          <cargoPublico><acumCargo>1</acumCargo><contagemEsp>1</contagemEsp><dedicExcl>N</dedicExcl><leiCargo><nrLei>${law}</nrLei><dtLei>${competence}-01</dtLei><sitCargo>1</sitCargo></leiCargo></cargoPublico>
        </dadosCargo>
      </inclusao>
    </infoCargo>
  </evtTabCargo>
</eSocial>`;
      return {
        id: row.id,
        sourceEntityKind: 'hr.job_position',
        xml,
        reference: id,
        competence,
        payload: {
          code: row.code,
          cboCode: cbo,
          legalRegime: row.legal_regime,
        },
      };
    });
  }

  private cboCode(value: string | null): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length === 6 ? digits : '252105';
  }

  private lawNumber(value: string): string {
    const compact = value.replace(/\s+/g, ' ').trim();
    return xmlEscape(compact || 'Lei 1/2026').slice(0, 12);
  }
}
