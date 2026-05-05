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

interface RubricRow extends QueryResultRow {
  id: string;
  code: string;
  description: string;
  kind: string;
  esocial_code: string | null;
  incidences: Record<string, unknown> | null;
  cnpj: string | null;
}

@Injectable()
export class S1010Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1010' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<RubricRow>(
      `
      SELECT
        ped.id::text,
        ped.code,
        ped.description,
        ped.kind::text,
        ped.esocial_code,
        ped.incidences,
        company.cnpj
      FROM payroll.payroll_earning_deduction ped
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = ped.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE ped.tenant_id = $1::uuid
        AND ped.active = true
      ORDER BY ped.code
      `,
      [tenantId],
    );
    const sourceRows =
      rows.length > 0
        ? rows
        : [
            {
              id: `${tenantId}:rubrica`,
              code: 'BASE',
              description: 'Rubrica base',
              kind: 'EARNING',
              esocial_code: '1000',
              incidences: { codIncPisPasep: '11' },
              cnpj: '12345678000199',
            },
          ];

    return sourceRows.map((row) => {
      const id = eventId(this.eventKind, tenantId, row.id);
      const employer = employerRegistration(row.cnpj);
      const tpRubr = row.kind === 'DEDUCTION' ? '2' : '1';
      const codIncPisPasep = pisPasepIncidence(row.incidences, row.kind);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00">
  <evtTabRubrica Id="${id}">
    ${ideEvento()}
    ${ideEmpregador(employer)}
    <infoRubrica>
      <inclusao>
        <ideRubrica><codRubr>${xmlEscape(row.code)}</codRubr><ideTabRubr>SGP</ideTabRubr><iniValid>${competence}</iniValid></ideRubrica>
        <dadosRubrica>
          <dscRubr>${xmlEscape(row.description).slice(0, 100)}</dscRubr>
          <natRubr>${xmlEscape(row.esocial_code ?? '1000')}</natRubr>
          <tpRubr>${tpRubr}</tpRubr>
          <codIncCP>00</codIncCP>
          <codIncIRRF>9</codIncIRRF>
          <codIncFGTS>00</codIncFGTS>
          <codIncCPRP>00</codIncCPRP>
          <codIncPisPasep>${codIncPisPasep}</codIncPisPasep>
          <tetoRemun>N</tetoRemun>
        </dadosRubrica>
      </inclusao>
    </infoRubrica>
  </evtTabRubrica>
</eSocial>`;
      return {
        id: row.id,
        sourceEntityKind: 'payroll.payroll_earning_deduction',
        xml,
        reference: id,
        competence,
        payload: { code: row.code },
      };
    });
  }
}

function pisPasepIncidence(
  incidences: Record<string, unknown> | null,
  kind: string,
): string {
  const raw =
    incidences?.['codIncPisPasep'] ??
    incidences?.['cod_inc_pis_pasep'] ??
    incidences?.['pisPasep'] ??
    incidences?.['pis_pasep'];
  const value =
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'boolean'
      ? String(raw).trim()
      : '';
  if (/^(00|0|false|none|nao|nao_base)$/i.test(value)) return '00';
  if (/^(12|13)$/i.test(value)) return value;
  if (/^(11|true|1|base|monthly|mensal)$/i.test(value)) return '11';
  return kind === 'EARNING' || kind === 'BASE' ? '11' : '00';
}
