import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { cleanText, cpf, ideEmpregadorXml } from './s22xx-common';
import { eventId, xmlEscape } from './s1xxx-common';

export interface S1200Rubric {
  code: string;
  tableCode: string;
  amount: string;
  quantity: string | null;
  kind: 'EARNING' | 'DEDUCTION' | 'INFORMATION' | 'BASE';
}

export interface S1200BuildResult {
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  xml: string;
  reference: string;
  competence: string;
  ideDmDev: string;
  payload: Record<string, unknown>;
}

interface PayrollRunRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  status: string;
  competence_year: number;
  competence_month: number;
}

interface PayrollItemRow extends QueryResultRow {
  tenant_id: string;
  payroll_run_id: string;
  competence_year: number;
  competence_month: number;
  employee_id: string;
  registration: string;
  cpf: string | null;
  cnpj: string | null;
  rubric_code: string;
  table_code: string | null;
  entry_kind: 'EARNING' | 'DEDUCTION' | 'INFORMATION' | 'BASE';
  amount: string;
  quantity: string | null;
}

interface WorkerGroup {
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  registration: string;
  cpf: string | null;
  cnpj: string | null;
  competenceYear: number;
  competenceMonth: number;
  rubrics: S1200Rubric[];
}

@Injectable()
export class S1200Builder {
  readonly eventKind = 'S-1200' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    payrollRunId: string,
    employeeId?: string,
  ): Promise<S1200BuildResult[]> {
    const run = await this.loadRun(tenantId, payrollRunId);
    if (run.status !== 'GENERATED') {
      throw new UnprocessableEntityException(
        'S-1200 emission requires payroll_run.status=GENERATED',
      );
    }

    const rows = await this.databaseService.query<PayrollItemRow>(
      `
      SELECT
        run.tenant_id::text,
        run.id::text AS payroll_run_id,
        run.competence_year,
        run.competence_month,
        employee.id::text AS employee_id,
        employee.registration,
        employee.cpf,
        company.cnpj,
        COALESCE(earning.esocial_code, earning.official_rubric_code, earning.code) AS rubric_code,
        COALESCE((earning.incidences->>'ideTabRubr'), 'SGP') AS table_code,
        earning.kind::text AS entry_kind,
        abs(sum(item.amount))::numeric(14,2)::text AS amount,
        NULLIF(sum(COALESCE(item.quantity, 0))::numeric(12,4), 0)::text AS quantity
      FROM payroll.payroll_run run
      JOIN payroll.employee_payroll_item item
        ON item.payroll_run_id = run.id
       AND item.tenant_id = run.tenant_id
       AND item.deleted_at IS NULL
      JOIN payroll.payroll_earning_deduction earning
        ON earning.id = item.earning_deduction_id
       AND earning.tenant_id = item.tenant_id
      JOIN hr.employee employee
        ON employee.id = item.employee_id
       AND employee.tenant_id = item.tenant_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = run.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE run.tenant_id = $1::uuid
        AND run.id = $2::uuid
        AND ($3::uuid IS NULL OR employee.id = $3::uuid)
      GROUP BY
        run.tenant_id,
        run.id,
        run.competence_year,
        run.competence_month,
        employee.id,
        employee.registration,
        employee.cpf,
        company.cnpj,
        COALESCE(earning.esocial_code, earning.official_rubric_code, earning.code),
        COALESCE((earning.incidences->>'ideTabRubr'), 'SGP'),
        earning.kind
      HAVING abs(sum(item.amount)) > 0
      ORDER BY employee.registration, rubric_code
      `,
      [tenantId, payrollRunId, employeeId ?? null],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        'Payroll run has no worker remuneration items',
      );
    }

    return Array.from(groupByWorker(rows).values()).map((group) =>
      this.buildWorker(group),
    );
  }

  private async loadRun(
    tenantId: string,
    payrollRunId: string,
  ): Promise<PayrollRunRow> {
    const rows = await this.databaseService.query<PayrollRunRow>(
      `
      SELECT id::text, tenant_id::text, status::text, competence_year, competence_month
      FROM payroll.payroll_run
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      `,
      [tenantId, payrollRunId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Payroll run not found');
    return row;
  }

  private buildWorker(group: WorkerGroup): S1200BuildResult {
    const competence = `${group.competenceYear}-${String(
      group.competenceMonth,
    ).padStart(2, '0')}`;
    const ideDmDev = demoId(group.payrollRunId, group.employeeId);
    const reference = eventId(
      'S-1200' as never,
      group.tenantId,
      `${group.payrollRunId}:${group.employeeId}`,
    );
    const itemsXml = group.rubrics.map((rubric) => rubricXml(rubric)).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00">
  <evtRemun Id="${reference}">
    ${ideEventoFolha(competence)}
    ${ideEmpregadorXml(group.cnpj)}
    <ideTrabalhador><cpfTrab>${cpf(group.cpf)}</cpfTrab></ideTrabalhador>
    <dmDev>
      <ideDmDev>${ideDmDev}</ideDmDev>
      <codCateg>101</codCateg>
      <infoPerApur>
        <ideEstabLot>
          <tpInsc>1</tpInsc>
          <nrInsc>${fullRegistration(group.cnpj)}</nrInsc>
          <codLotacao>LOT01</codLotacao>
          <remunPerApur>
            <matricula>${cleanText(group.registration, group.employeeId).slice(0, 30)}</matricula>
            ${itemsXml}
          </remunPerApur>
        </ideEstabLot>
      </infoPerApur>
    </dmDev>
  </evtRemun>
</eSocial>`;

    return {
      tenantId: group.tenantId,
      payrollRunId: group.payrollRunId,
      employeeId: group.employeeId,
      xml,
      reference,
      competence,
      ideDmDev,
      payload: {
        payrollRunId: group.payrollRunId,
        employeeId: group.employeeId,
        ideDmDev,
        rubricCount: group.rubrics.length,
        totalsByTpRubrica: totalsByKind(group.rubrics),
      },
    };
  }
}

function groupByWorker(rows: PayrollItemRow[]): Map<string, WorkerGroup> {
  const groups = new Map<string, WorkerGroup>();
  for (const row of rows) {
    let group = groups.get(row.employee_id);
    if (!group) {
      group = {
        tenantId: row.tenant_id,
        payrollRunId: row.payroll_run_id,
        employeeId: row.employee_id,
        registration: row.registration,
        cpf: row.cpf,
        cnpj: row.cnpj,
        competenceYear: row.competence_year,
        competenceMonth: row.competence_month,
        rubrics: [],
      };
      groups.set(row.employee_id, group);
    }
    group.rubrics.push({
      code: row.rubric_code,
      tableCode: row.table_code ?? 'SGP',
      amount: money(row.amount),
      quantity: row.quantity,
      kind: row.entry_kind,
    });
  }
  return groups;
}

function rubricXml(rubric: S1200Rubric): string {
  const quantity = rubric.quantity
    ? `<qtdRubr>${decimal(rubric.quantity, 4)}</qtdRubr>`
    : '';
  return `<itensRemun><codRubr>${xmlEscape(rubric.code).slice(0, 30)}</codRubr><ideTabRubr>${xmlEscape(rubric.tableCode).slice(0, 8)}</ideTabRubr>${quantity}<vrRubr>${money(rubric.amount)}</vrRubr><indApurIR>0</indApurIR></itensRemun>`;
}

function totalsByKind(rubrics: S1200Rubric[]): Record<string, string> {
  return rubrics.reduce<Record<string, string>>((totals, rubric) => {
    totals[rubric.kind] = moneyFromCents(
      cents(totals[rubric.kind] ?? '0.00') + cents(rubric.amount),
    );
    return totals;
  }, {});
}

function ideEventoFolha(competence: string): string {
  return `<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${competence}</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>`;
}

function demoId(payrollRunId: string, employeeId: string): string {
  return `DM${payrollRunId.replace(/\D/g, '').slice(0, 10)}${employeeId
    .replace(/\D/g, '')
    .slice(0, 10)}`.slice(0, 30);
}

function fullRegistration(cnpj: string | null | undefined): string {
  const digits = String(cnpj ?? '').replace(/\D/g, '');
  return (
    digits.length >= 14 ? digits.slice(0, 14) : '12345678000199'
  ).padStart(14, '0');
}

function money(value: string): string {
  return decimal(value, 2);
}

function decimal(value: string, scale: number): string {
  const [wholeRaw = '0', fractionRaw = ''] = String(value).split('.');
  const whole = wholeRaw.replace(/[^\d-]/g, '') || '0';
  const fraction = fractionRaw
    .replace(/\D/g, '')
    .padEnd(scale, '0')
    .slice(0, scale);
  return `${whole}.${fraction}`;
}

function cents(value: string): bigint {
  const [wholeRaw = '0', fractionRaw = ''] = money(value).split('.');
  return (
    BigInt(wholeRaw) * 100n + BigInt(fractionRaw.padEnd(2, '0').slice(0, 2))
  );
}

function moneyFromCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
