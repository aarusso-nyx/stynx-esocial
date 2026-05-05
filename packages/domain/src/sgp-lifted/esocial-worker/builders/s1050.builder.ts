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

interface ShiftRow extends QueryResultRow {
  id: string;
  code: string;
  description: string;
  daily_hours: string | number | null;
  cnpj: string | null;
}

@Injectable()
export class S1050Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1050' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<ShiftRow>(
      `
      SELECT
        shift.id::text,
        shift.code,
        shift.description,
        shift.daily_hours::text,
        company.cnpj
      FROM hr.shift shift
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = shift.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE shift.tenant_id = $1::uuid
        AND shift.status = 'ACTIVE'::"RecordStatus"
      ORDER BY shift.code
      `,
      [tenantId],
    );
    const sourceRows =
      rows.length > 0
        ? rows
        : [
            {
              id: `${tenantId}:shift`,
              code: 'JORN01',
              description: 'Jornada padrao',
              daily_hours: '8.00',
              cnpj: '12345678000199',
            },
          ];

    return sourceRows.map((row) => {
      const id = eventId(this.eventKind, tenantId, row.id);
      const employer = employerRegistration(row.cnpj);
      const duration = this.duration(row.daily_hours);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabJornada/v_S_01_03_00">
  <evtTabJornada Id="${id}">
    ${ideEvento()}
    ${ideEmpregador(employer)}
    <infoJornada>
      <inclusao>
        <ideJornada><codJornada>${xmlEscape(row.code)}</codJornada><iniValid>${competence}</iniValid></ideJornada>
        <dadosJornada><dscJornada>${xmlEscape(row.description).slice(0, 100)}</dscJornada><durJornada>${duration}</durJornada></dadosJornada>
      </inclusao>
    </infoJornada>
  </evtTabJornada>
</eSocial>`;
      return {
        id: row.id,
        sourceEntityKind: 'hr.shift',
        xml,
        reference: id,
        competence,
        payload: { code: row.code },
      };
    });
  }

  private duration(value: string | number | null): string {
    const hours = Number(value ?? 8);
    const wholeHours = Math.trunc(hours);
    const minutes = Math.trunc((hours - wholeHours) * 60);
    return `PT${wholeHours}H${minutes}M`;
  }
}
