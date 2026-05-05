import { createHash } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { xmlEscape } from './s1xxx-common';
import { cleanText, cpf, dateOnly, ideEmpregadorXml } from './s22xx-common';

export interface S2299BuildResult {
  pendingId: string;
  tenantId: string;
  employmentLinkId: string;
  employeeId: string;
  calcRunId: string;
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface PendingRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  employment_link_id: string;
  employee_id: string;
  calc_run_id: string;
}

interface TerminationRow extends QueryResultRow {
  tenant_id: string;
  employment_link_id: string;
  employee_id: string;
  calc_run_id: string;
  run_status: string;
  competence_year: number;
  competence_month: number;
  registration: string;
  cpf: string | null;
  terminated_on: Date | string | null;
  link_end_date: Date | string | null;
  termination_reason_code: string | null;
  cnpj: string | null;
  branch_cnpj: string | null;
  work_location_code: string | null;
}

interface ComponentRow extends QueryResultRow {
  component_code: string;
  amount: string;
  quantity: string | null;
}

@Injectable()
export class S2299Builder {
  readonly eventKind = 'S-2299' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildPending(
    tenantId: string,
    pendingId: string,
  ): Promise<S2299BuildResult> {
    const pending = await this.databaseService.query<PendingRow>(
      `
      SELECT id::text, tenant_id::text, employment_link_id::text, employee_id::text, calc_run_id::text
      FROM esocial.s2299_pending
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
        AND status = 'PENDING'
      `,
      [tenantId, pendingId],
    );
    const row = pending[0];
    if (!row) throw new NotFoundException('Pending S-2299 event not found');
    return this.buildFromPending(row);
  }

  async buildFromPending(pending: PendingRow): Promise<S2299BuildResult> {
    const rows = await this.databaseService.query<TerminationRow>(
      `
      SELECT
        run.tenant_id::text,
        link.id::text AS employment_link_id,
        employee.id::text AS employee_id,
        run.id::text AS calc_run_id,
        run.status::text AS run_status,
        run.competence_year,
        run.competence_month,
        employee.registration,
        employee.cpf,
        employee.terminated_on,
        link.end_date AS link_end_date,
        reason.code AS termination_reason_code,
        company.cnpj,
        branch.cnpj AS branch_cnpj,
        work_location.code AS work_location_code
      FROM payroll.payroll_run run
      JOIN hr.employment_link link
        ON link.termination_payroll_run_id = run.id
       AND link.tenant_id = run.tenant_id
      JOIN hr.employee employee
        ON employee.id = $3::uuid
       AND employee.tenant_id = run.tenant_id
      LEFT JOIN hr.termination_reason reason ON reason.id = employee.termination_reason_id
      LEFT JOIN hr.work_location work_location ON work_location.id = employee.work_location_id
      LEFT JOIN hr.branch branch ON branch.id = COALESCE(run.branch_id, employee.branch_id, work_location.branch_id)
      LEFT JOIN hr.company company ON company.id = branch.company_id
      WHERE run.tenant_id = $1::uuid
        AND run.id = $2::uuid
        AND link.id = $4::uuid
      `,
      [
        pending.tenant_id,
        pending.calc_run_id,
        pending.employee_id,
        pending.employment_link_id,
      ],
    );
    const termination = rows[0];
    if (!termination)
      throw new NotFoundException('S-2299 source record not found');
    if (termination.run_status !== 'GENERATED') {
      throw new BadRequestException(
        'S-2299 requires payroll_run.status=GENERATED',
      );
    }

    const components = await this.databaseService.query<ComponentRow>(
      `
      SELECT component_code, amount::text, quantity::text
      FROM payroll.v_termination_components
      WHERE tenant_id = $1::uuid
        AND payroll_run_id = $2::uuid
        AND employee_id = $3::uuid
        AND amount > 0
      ORDER BY component_code
      `,
      [pending.tenant_id, pending.calc_run_id, pending.employee_id],
    );

    if (components.length === 0) {
      throw new BadRequestException(
        'S-2299 requires generated termination components',
      );
    }

    const id = eventId(
      'S-2299',
      pending.tenant_id,
      `${pending.id}:${pending.calc_run_id}`,
    );
    const terminationDate = dateOnly(
      termination.terminated_on ?? termination.link_end_date,
    );
    const competence = `${termination.competence_year}-${String(termination.competence_month).padStart(2, '0')}`;
    const hasNotice = components.some(
      (row) => row.component_code === 'RESC_AVISO_PREVIO',
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtDeslig/v_S_01_03_00">
  <evtDeslig Id="${id}">
    ${ideEventoDeslig()}
    ${ideEmpregadorXml(termination.cnpj)}
    <ideVinculo><cpfTrab>${cpf(termination.cpf)}</cpfTrab><matricula>${cleanText(termination.registration, termination.employee_id).slice(0, 30)}</matricula></ideVinculo>
    <infoDeslig>
      <mtvDeslig>${terminationReason(termination.termination_reason_code)}</mtvDeslig>
      <dtDeslig>${terminationDate}</dtDeslig>
      <indPagtoAPI>${hasNotice ? 'S' : 'N'}</indPagtoAPI>
      ${hasNotice ? `<dtProjFimAPI>${dateOnly(addDays(terminationDate, 30))}</dtProjFimAPI>` : ''}
      <verbasResc>
        <dmDev>
          <ideDmDev>${cleanText(`RESC${termination.competence_year}${String(termination.competence_month).padStart(2, '0')}`, 'RESC')}</ideDmDev>
          <infoPerApur>
            <ideEstabLot>
              <tpInsc>1</tpInsc>
              <nrInsc>${registration8(termination.branch_cnpj ?? termination.cnpj)}</nrInsc>
              <codLotacao>${cleanText(termination.work_location_code, 'LOT01').slice(0, 30)}</codLotacao>
              ${components.map(componentXml).join('\n              ')}
            </ideEstabLot>
          </infoPerApur>
        </dmDev>
      </verbasResc>
    </infoDeslig>
  </evtDeslig>
</eSocial>`;

    return {
      pendingId: pending.id,
      tenantId: pending.tenant_id,
      employmentLinkId: pending.employment_link_id,
      employeeId: pending.employee_id,
      calcRunId: pending.calc_run_id,
      xml,
      reference: id,
      competence,
      payload: {
        pendingId: pending.id,
        calcRunId: pending.calc_run_id,
        componentCount: components.length,
        hasIndemnifiedNotice: hasNotice,
      },
    };
  }
}

function ideEventoDeslig(): string {
  return '<ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>';
}

function componentXml(row: ComponentRow): string {
  const quantity = row.quantity
    ? `<qtdRubr>${Number(row.quantity).toFixed(2)}</qtdRubr>`
    : '';
  return `<detVerbas><codRubr>${xmlEscape(row.component_code).slice(0, 30)}</codRubr><ideTabRubr>SGP</ideTabRubr>${quantity}<vrRubr>${Number(row.amount).toFixed(2)}</vrRubr><indApurIR>0</indApurIR></detVerbas>`;
}

function terminationReason(value: string | null): string {
  const normalized = String(value ?? '').toUpperCase();
  if (normalized.includes('SEM_JUSTA_CAUSA')) return '02';
  if (normalized.includes('OBITO')) return '10';
  if (normalized.includes('PEDIDO') || normalized.includes('EXONERACAO'))
    return '07';
  return /^\d{2}$/.test(normalized) ? normalized : '07';
}

function registration8(value: string | null | undefined): string {
  return String(value ?? '12345678000199')
    .replace(/\D/g, '')
    .padEnd(14, '0')
    .slice(0, 14);
}

function addDays(date: string, days: number): Date {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function eventId(
  eventKind: string,
  tenantId: string,
  sourceId: string,
): string {
  const digits = createHash('sha256')
    .update(`${eventKind}:${tenantId}:${sourceId}`, 'utf8')
    .digest('hex')
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
