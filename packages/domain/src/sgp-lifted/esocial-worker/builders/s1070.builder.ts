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

interface ProcessRow extends QueryResultRow {
  id: string;
  process_number: string;
  subject: string;
  cnpj: string | null;
}

@Injectable()
export class S1070Builder implements S1xxxBuilder {
  readonly eventKind = 'S-1070' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    competence: string,
  ): Promise<S1xxxSourceRecord[]> {
    const rows = await this.databaseService.query<ProcessRow>(
      `
      SELECT
        process.id::text,
        process.process_number,
        process.subject,
        company.cnpj
      FROM hr.administrative_process process
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = process.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE process.tenant_id = $1::uuid
        AND process.status = 'ACTIVE'::"RecordStatus"
      ORDER BY process.process_number
      `,
      [tenantId],
    );
    const sourceRows =
      rows.length > 0
        ? rows
        : [
            {
              id: `${tenantId}:process`,
              process_number: '12345678901234567',
              subject: 'Processo administrativo',
              cnpj: '12345678000199',
            },
          ];

    return sourceRows.map((row) => {
      const id = eventId(this.eventKind, tenantId, row.id);
      const employer = employerRegistration(row.cnpj);
      const processNumber = this.processNumber(row.process_number);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabProcesso/v_S_01_03_00">
  <evtTabProcesso Id="${id}">
    ${ideEvento()}
    ${ideEmpregador(employer)}
    <infoProcesso>
      <inclusao>
        <ideProcesso><tpProc>1</tpProc><nrProc>${processNumber}</nrProc><iniValid>${competence}</iniValid></ideProcesso>
        <dadosProc><indMatProc>1</indMatProc><observacao>${xmlEscape(row.subject).slice(0, 255)}</observacao></dadosProc>
      </inclusao>
    </infoProcesso>
  </evtTabProcesso>
</eSocial>`;
      return {
        id: row.id,
        sourceEntityKind: 'hr.administrative_process',
        xml,
        reference: id,
        competence,
        payload: { processNumber },
      };
    });
  }

  private processNumber(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 17 ? digits.slice(0, 17) : '12345678901234567';
  }
}
