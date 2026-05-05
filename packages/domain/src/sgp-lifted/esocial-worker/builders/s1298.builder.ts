import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  employerRegistration,
  eventId,
  fullRegistration,
} from './s1xxx-common';
import { dateCompetence, monthCompetence } from './s1299.builder';

export interface S1298BuildResult {
  tenantId: string;
  competence: string;
  xml: string;
  reference: string;
  payload: Record<string, unknown>;
}

interface CompanyRow extends QueryResultRow {
  cnpj: string | null;
}

interface ClosureStateRow extends QueryResultRow {
  status: 'PENDING' | 'EMITTED' | 'ACCEPTED' | 'REJECTED';
  recibo: string | null;
  accepted_at: Date | string | null;
}

@Injectable()
export class S1298Builder {
  readonly eventKind = 'S-1298' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(tenantId: string, competence: string): Promise<S1298BuildResult> {
    const normalizedCompetence = monthCompetence(competence);
    const [state] = await this.databaseService.query<ClosureStateRow>(
      `
      SELECT status::text, recibo, accepted_at
      FROM esocial.s1299_emission_state
      WHERE tenant_id = $1::uuid
        AND competence = $2::date
      `,
      [tenantId, dateCompetence(normalizedCompetence)],
    );

    if (
      state?.status !== 'ACCEPTED' ||
      !state.accepted_at ||
      !state.recibo?.trim()
    ) {
      throw new UnprocessableEntityException({
        code: 'ESOCIAL_S1298_CLOSURE_NOT_ACCEPTED',
        message:
          'S-1298 reopening requires an accepted S-1299 closure receipt for the competence',
        competence: normalizedCompetence,
        currentStatus: state?.status ?? null,
      });
    }

    const [company] = await this.databaseService.query<CompanyRow>(
      `
      SELECT cnpj
      FROM hr.company
      WHERE tenant_id = $1::uuid
        AND status = 'ACTIVE'::public."RecordStatus"
      ORDER BY code
      LIMIT 1
      `,
      [tenantId],
    );

    const reference = eventId(
      'S-1298' as never,
      tenantId,
      normalizedCompetence,
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtReabreEvPer/v_S_01_03_00">
  <evtReabreEvPer Id="${reference}">
    <ideEvento><indApuracao>1</indApuracao><perApur>${normalizedCompetence}</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(company?.cnpj)}</nrInsc></ideEmpregador>
  </evtReabreEvPer>
</eSocial>`;

    return {
      tenantId,
      competence: normalizedCompetence,
      xml,
      reference,
      payload: {
        competence: normalizedCompetence,
        employerRegistration: fullRegistration(company?.cnpj),
        reopenedFromS1299Receipt: state.recibo.trim(),
      },
    };
  }
}
