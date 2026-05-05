import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { cpf, ideEmpregadorXml } from './s22xx-common';
import { onlyDigits, sha256, xmlEscape } from './s1xxx-common';

export type S1207BenefitSourceKind = 'RETIREMENT' | 'PENSION';

export interface S1207Rubric {
  code: string;
  tableCode: string;
  amount: string;
  quantity: string | null;
  kind: 'EARNING' | 'DEDUCTION' | 'INFORMATION' | 'BASE';
}

export interface S1207BuildResult {
  tenantId: string;
  payrollRunId: string;
  benefitSourceKind: S1207BenefitSourceKind;
  benefitSourceId: string;
  employeeId: string;
  xml: string;
  reference: string;
  competence: string;
  ideDmDev: string;
  nrBeneficio: string;
  payload: Record<string, unknown>;
}

interface PayrollRunRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  status: string;
  competence_year: number;
  competence_month: number;
}

interface BenefitPayrollItemRow extends QueryResultRow {
  tenant_id: string;
  payroll_run_id: string;
  competence_year: number;
  competence_month: number;
  employee_id: string;
  beneficiary_cpf: string | null;
  cnpj: string | null;
  benefit_source_kind: S1207BenefitSourceKind;
  benefit_source_id: string;
  nr_beneficio: string;
  active_benefit_count: string;
  rubric_code: string;
  table_code: string | null;
  entry_kind: 'EARNING' | 'DEDUCTION' | 'INFORMATION' | 'BASE';
  amount: string;
  quantity: string | null;
}

interface BenefitGroup {
  tenantId: string;
  payrollRunId: string;
  competenceYear: number;
  competenceMonth: number;
  employeeId: string;
  beneficiaryCpf: string | null;
  cnpj: string | null;
  benefitSourceKind: S1207BenefitSourceKind;
  benefitSourceId: string;
  benefitNumber: string;
  activeBenefitCount: number;
  rubrics: S1207Rubric[];
}

@Injectable()
export class S1207Builder {
  readonly eventKind = 'S-1207' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    payrollRunId: string,
    employeeId?: string,
  ): Promise<S1207BuildResult[]> {
    const run = await this.loadRun(tenantId, payrollRunId);
    if (run.status !== 'GENERATED') {
      throw new UnprocessableEntityException(
        'S-1207 emission requires payroll_run.status=GENERATED',
      );
    }

    const rows = await this.databaseService.query<BenefitPayrollItemRow>(
      `
      WITH run_scope AS (
        SELECT
          run.id,
          run.tenant_id,
          run.competence_year,
          run.competence_month,
          make_date(run.competence_year, run.competence_month, 1) AS period_start,
          (
            make_date(run.competence_year, run.competence_month, 1)
            + interval '1 month'
            - interval '1 day'
          )::date AS period_end
        FROM payroll.payroll_run run
        WHERE run.tenant_id = $1::uuid
          AND run.id = $2::uuid
      )
      SELECT
        run.tenant_id::text,
        run.id::text AS payroll_run_id,
        run.competence_year,
        run.competence_month,
        employee.id::text AS employee_id,
        benefit.beneficiary_cpf,
        company.cnpj,
        benefit.source_kind AS benefit_source_kind,
        benefit.source_id AS benefit_source_id,
        benefit.nr_beneficio,
        benefit.active_benefit_count::text,
        COALESCE(earning.esocial_code, earning.official_rubric_code, earning.code) AS rubric_code,
        COALESCE((earning.incidences->>'ideTabRubr'), 'SGP') AS table_code,
        earning.kind::text AS entry_kind,
        abs(sum(item.amount))::numeric(14,2)::text AS amount,
        NULLIF(sum(COALESCE(item.quantity, 0))::numeric(12,4), 0)::text AS quantity
      FROM run_scope run
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
      JOIN LATERAL (
        WITH active_benefit AS (
          SELECT
            'RETIREMENT'::text AS source_kind,
            grant_row.id::text AS source_id,
            regexp_replace(employee.cpf, '\\D', '', 'g') AS beneficiary_cpf,
            concat('RET', lpad(right(regexp_replace(grant_row.id::text, '\\D', '', 'g'), 17), 17, '0')) AS nr_beneficio,
            grant_row.granted_on AS granted_on
          FROM hr.retirement_grant grant_row
          WHERE grant_row.tenant_id = run.tenant_id
            AND grant_row.employee_id = employee.id
            AND grant_row.status = 'CONCEDIDA'
            AND grant_row.granted_on <= run.period_end
          UNION ALL
          SELECT
            'PENSION'::text AS source_kind,
            pension.id::text AS source_id,
            regexp_replace(pension.beneficiary_cpf, '\\D', '', 'g') AS beneficiary_cpf,
            concat('PEN', lpad(right(regexp_replace(pension.id::text, '\\D', '', 'g'), 17), 17, '0')) AS nr_beneficio,
            pension.granted_on AS granted_on
          FROM hr.pension_grant pension
          WHERE pension.tenant_id = run.tenant_id
            AND regexp_replace(pension.beneficiary_cpf, '\\D', '', 'g') = regexp_replace(employee.cpf, '\\D', '', 'g')
            AND pension.granted_on <= run.period_end
            AND (pension.ceased_on IS NULL OR pension.ceased_on >= run.period_start)
        )
        SELECT
          source_kind,
          source_id,
          beneficiary_cpf,
          nr_beneficio,
          count(*) OVER () AS active_benefit_count
        FROM active_benefit
        ORDER BY granted_on DESC, source_kind, source_id
        LIMIT 1
      ) benefit ON true
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = run.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE ($3::uuid IS NULL OR employee.id = $3::uuid)
      GROUP BY
        run.tenant_id,
        run.id,
        run.competence_year,
        run.competence_month,
        employee.id,
        benefit.beneficiary_cpf,
        company.cnpj,
        benefit.source_kind,
        benefit.source_id,
        benefit.nr_beneficio,
        benefit.active_benefit_count,
        COALESCE(earning.esocial_code, earning.official_rubric_code, earning.code),
        COALESCE((earning.incidences->>'ideTabRubr'), 'SGP'),
        earning.kind
      HAVING abs(sum(item.amount)) > 0
      ORDER BY benefit.beneficiary_cpf, benefit.nr_beneficio, rubric_code
      `,
      [tenantId, payrollRunId, employeeId ?? null],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        'Payroll run has no RPPS benefit items reconciled to S-2410 grants',
      );
    }

    const groups = groupByBenefit(rows);
    for (const group of groups.values()) {
      if (group.activeBenefitCount > 1) {
        throw new UnprocessableEntityException(
          'S-1207 emission requires exactly one active S-2410 benefit per beneficiary payroll row',
        );
      }
    }

    return Array.from(groups.values()).map((group) => this.buildBenefit(group));
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

  private buildBenefit(group: BenefitGroup): S1207BuildResult {
    const competence = `${group.competenceYear}-${String(
      group.competenceMonth,
    ).padStart(2, '0')}`;
    const ideDmDev = demoId(group.payrollRunId, group.benefitSourceId);
    const reference = eventId(
      this.eventKind,
      group.tenantId,
      `${group.payrollRunId}:${group.benefitSourceKind}:${group.benefitSourceId}`,
    );
    const itemsXml = group.rubrics.map((rubric) => rubricXml(rubric)).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtBenPrRP/v_S_01_03_00">
  <evtBenPrRP Id="${reference}">
    ${ideEventoFolha(competence)}
    ${ideEmpregadorXml(group.cnpj)}
    <ideBenef><cpfBenef>${cpf(group.beneficiaryCpf)}</cpfBenef></ideBenef>
    <dmDev>
      <ideDmDev>${ideDmDev}</ideDmDev>
      <nrBeneficio>${xmlEscape(group.benefitNumber)}</nrBeneficio>
      <infoPerApur>
        <ideEstab>
          <tpInsc>1</tpInsc>
          <nrInsc>${fullRegistration(group.cnpj)}</nrInsc>
          ${itemsXml}
        </ideEstab>
      </infoPerApur>
    </dmDev>
  </evtBenPrRP>
</eSocial>`;

    return {
      tenantId: group.tenantId,
      payrollRunId: group.payrollRunId,
      benefitSourceKind: group.benefitSourceKind,
      benefitSourceId: group.benefitSourceId,
      employeeId: group.employeeId,
      xml,
      reference,
      competence,
      ideDmDev,
      nrBeneficio: group.benefitNumber,
      payload: {
        payrollRunId: group.payrollRunId,
        employeeId: group.employeeId,
        sourceKind: group.benefitSourceKind,
        benefitSourceId: group.benefitSourceId,
        nrBeneficio: group.benefitNumber,
        cpfBenef: onlyDigits(group.beneficiaryCpf),
        ideDmDev,
        rubricCount: group.rubrics.length,
        totalsByTpRubrica: totalsByKind(group.rubrics),
      },
    };
  }
}

function groupByBenefit(
  rows: BenefitPayrollItemRow[],
): Map<string, BenefitGroup> {
  const groups = new Map<string, BenefitGroup>();
  for (const row of rows) {
    const key = `${row.benefit_source_kind}:${row.benefit_source_id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        tenantId: row.tenant_id,
        payrollRunId: row.payroll_run_id,
        competenceYear: row.competence_year,
        competenceMonth: row.competence_month,
        employeeId: row.employee_id,
        beneficiaryCpf: row.beneficiary_cpf,
        cnpj: row.cnpj,
        benefitSourceKind: row.benefit_source_kind,
        benefitSourceId: row.benefit_source_id,
        benefitNumber: row.nr_beneficio,
        activeBenefitCount: Number(row.active_benefit_count),
        rubrics: [],
      };
      groups.set(key, group);
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

function rubricXml(rubric: S1207Rubric): string {
  const quantity = rubric.quantity
    ? `<qtdRubr>${decimal(rubric.quantity, 4)}</qtdRubr>`
    : '';
  return `<itensRemun><codRubr>${xmlEscape(rubric.code).slice(0, 30)}</codRubr><ideTabRubr>${xmlEscape(rubric.tableCode).slice(0, 8)}</ideTabRubr>${quantity}<vrRubr>${money(rubric.amount)}</vrRubr><indApurIR>0</indApurIR></itensRemun>`;
}

function totalsByKind(rubrics: S1207Rubric[]): Record<string, string> {
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

function demoId(payrollRunId: string, benefitSourceId: string): string {
  return `DM${payrollRunId.replace(/\D/g, '').slice(0, 10)}${benefitSourceId
    .replace(/\D/g, '')
    .slice(0, 10)}`.slice(0, 30);
}

function eventId(
  eventKind: 'S-1207',
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}

function fullRegistration(cnpj: string | null | undefined): string {
  const digits = onlyDigits(cnpj);
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
