import { UnprocessableEntityException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  employerRegistration,
  eventId,
  fullRegistration,
  xmlEscape,
} from './s1xxx-common';

export interface S1299PendingPeriodic {
  eventKind: 'S-1200' | 'S-1202' | 'S-1210';
  payrollRunId: string | null;
  paymentBatchId: string | null;
  employeeId: string;
  reason: string;
}

export interface S1299BuildResult {
  tenantId: string;
  competence: string;
  xml: string;
  reference: string;
  payload: Record<string, unknown>;
}

interface PendingRow extends QueryResultRow {
  event_kind: 'S-1200' | 'S-1202' | 'S-1210';
  payroll_run_id: string | null;
  payment_batch_id: string | null;
  employee_id: string;
  reason: string;
}

interface CompanyRow extends QueryResultRow {
  cnpj: string | null;
}

interface TotalsRow extends QueryResultRow {
  remuneration_count: string;
  payment_count: string;
}

@Injectable()
export class S1299Builder {
  readonly eventKind = 'S-1299' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(tenantId: string, competence: string): Promise<S1299BuildResult> {
    const normalizedCompetence = monthCompetence(competence);
    const pending = await this.pending(tenantId, normalizedCompetence);
    if (pending.length > 0) {
      throw new UnprocessableEntityException({
        code: 'ESOCIAL_S1299_PERIODICS_PENDING',
        message:
          'S-1299 closure requires all S-1200/S-1202/S-1210 periodics to have accepted receipts',
        competence: normalizedCompetence,
        pending,
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
    const [totals] = await this.databaseService.query<TotalsRow>(
      `
      SELECT
        count(DISTINCT COALESCE(s1200.employee_id, s1202.employee_id))::text AS remuneration_count,
        count(DISTINCT s1210.employee_id)::text AS payment_count
      FROM (SELECT $1::uuid AS tenant_id, $2::date AS competence) input
      LEFT JOIN esocial.s1200_emission_state s1200
        ON s1200.tenant_id = input.tenant_id
       AND NULLIF(btrim(s1200.recibo), '') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM payroll.payroll_run run
         WHERE run.tenant_id = s1200.tenant_id
           AND run.id = s1200.payroll_run_id
           AND make_date(run.competence_year, run.competence_month, 1) = input.competence
       )
      LEFT JOIN esocial.s1202_emission_state s1202
        ON s1202.tenant_id = input.tenant_id
       AND NULLIF(btrim(s1202.recibo), '') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM payroll.payroll_run run
         WHERE run.tenant_id = s1202.tenant_id
           AND run.id = s1202.payroll_run_id
           AND make_date(run.competence_year, run.competence_month, 1) = input.competence
       )
      LEFT JOIN esocial.s1210_emission_state s1210
        ON s1210.tenant_id = input.tenant_id
       AND NULLIF(btrim(s1210.recibo), '') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM payroll.payment_remittance_file file
         WHERE file.tenant_id = s1210.tenant_id
           AND file.id = s1210.payment_batch_id
           AND make_date(file.competence_year, file.competence_month, 1) = input.competence
       )
      `,
      [tenantId, dateCompetence(normalizedCompetence)],
    );

    const reference = eventId(
      'S-1299' as never,
      tenantId,
      normalizedCompetence,
    );
    const hasRemuneration = Number(totals?.remuneration_count ?? 0) > 0;
    const hasPayments = Number(totals?.payment_count ?? 0) > 0;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00">
  <evtFechaEvPer Id="${reference}">
    <ideEvento><indApuracao>1</indApuracao><perApur>${normalizedCompetence}</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(company?.cnpj)}</nrInsc></ideEmpregador>
    <infoFech>
      <evtRemun>${hasRemuneration ? 'S' : 'N'}</evtRemun>
      <evtPgtos>${hasPayments ? 'S' : 'N'}</evtPgtos>
      <evtComProd>N</evtComProd>
      <evtContratAvNP>N</evtContratAvNP>
      <evtInfoComplPer>N</evtInfoComplPer>
    </infoFech>
  </evtFechaEvPer>
</eSocial>`;

    return {
      tenantId,
      competence: normalizedCompetence,
      xml,
      reference,
      payload: {
        competence: normalizedCompetence,
        employerRegistration: fullRegistration(company?.cnpj),
        remunerationCount: totals?.remuneration_count ?? '0',
        paymentCount: totals?.payment_count ?? '0',
      },
    };
  }

  async pending(
    tenantId: string,
    competence: string,
  ): Promise<S1299PendingPeriodic[]> {
    const rows = await this.databaseService.query<PendingRow>(
      `
      SELECT
        event_kind,
        payroll_run_id::text,
        payment_batch_id::text,
        employee_id::text,
        reason
      FROM esocial.v_competence_periodics_pending
      WHERE tenant_id = $1::uuid
        AND competence = $2::date
      ORDER BY event_kind, employee_id
      `,
      [tenantId, dateCompetence(competence)],
    );
    return rows.map((row) => ({
      eventKind: row.event_kind,
      payrollRunId: row.payroll_run_id,
      paymentBatchId: row.payment_batch_id,
      employeeId: row.employee_id,
      reason: row.reason,
    }));
  }
}

export function monthCompetence(value: string): string {
  const match = value.trim().match(/^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/);
  if (!match) {
    throw new UnprocessableEntityException(
      'Competence must be a monthly YYYY-MM value',
    );
  }
  return `${xmlEscape(match[1]!)}-${xmlEscape(match[2]!)}`;
}

export function dateCompetence(value: string): string {
  return `${monthCompetence(value)}-01`;
}
