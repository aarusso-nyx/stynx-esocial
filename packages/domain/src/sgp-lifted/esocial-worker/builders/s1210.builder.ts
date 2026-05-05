import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { cpf, ideEmpregadorXml } from './s22xx-common';
import { eventId } from './s1xxx-common';

export interface S1210BuildResult {
  tenantId: string;
  paymentBatchId: string;
  payrollRunId: string | null;
  employeeId: string;
  xml: string;
  reference: string;
  competence: string;
  ideDmDev: string;
  vrLiq: string;
  payload: Record<string, unknown>;
}

interface RemittanceRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  payroll_run_id: string | null;
  status: string;
  competence_year: number;
  competence_month: number;
  payment_date: Date | string | null;
  total_amount: string;
  confirmed_total: string;
}

interface PaymentDetailRow extends QueryResultRow {
  tenant_id: string;
  payment_batch_id: string;
  payroll_run_id: string | null;
  competence_year: number;
  competence_month: number;
  payment_date: Date | string | null;
  employee_id: string;
  cpf: string | null;
  cnpj: string | null;
  amount: string;
}

@Injectable()
export class S1210Builder {
  readonly eventKind = 'S-1210' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    paymentBatchId: string,
    employeeId?: string,
  ): Promise<S1210BuildResult[]> {
    const remittance = await this.loadRemittance(tenantId, paymentBatchId);
    if (remittance.status !== 'PAID') {
      throw new UnprocessableEntityException(
        'S-1210 emission requires payment remittance confirmation status=PAID',
      );
    }

    const rows = await this.databaseService.query<PaymentDetailRow>(
      `
      SELECT
        file.tenant_id::text,
        file.id::text AS payment_batch_id,
        file.payroll_run_id::text,
        file.competence_year,
        file.competence_month,
        file.payment_date,
        employee.id::text AS employee_id,
        employee.cpf,
        company.cnpj,
        sum(detail.amount)::numeric(14,2)::text AS amount
      FROM payroll.payment_remittance_file file
      JOIN payroll.payment_remittance_detail detail
        ON detail.file_id = file.id
       AND detail.tenant_id = file.tenant_id
      JOIN hr.employee employee
        ON employee.id = detail.employee_id
       AND employee.tenant_id = detail.tenant_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = file.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE file.tenant_id = $1::uuid
        AND file.id = $2::uuid
        AND COALESCE(NULLIF(detail.occurrence_code, ''), '00') IN ('0', '00', '000')
        AND ($3::uuid IS NULL OR employee.id = $3::uuid)
      GROUP BY
        file.tenant_id,
        file.id,
        file.payroll_run_id,
        file.competence_year,
        file.competence_month,
        file.payment_date,
        employee.id,
        employee.cpf,
        company.cnpj
      HAVING sum(detail.amount) > 0
      ORDER BY employee.id
      `,
      [tenantId, paymentBatchId, employeeId ?? null],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        'Confirmed payment batch has no paid workers',
      );
    }

    const emittedTotal = rows.reduce(
      (total, row) => total + cents(row.amount),
      0n,
    );
    const expectedTotal = cents(remittance.confirmed_total);
    if (!employeeId && emittedTotal !== expectedTotal) {
      throw new UnprocessableEntityException(
        `S-1210 vrLiq total ${moneyFromCents(
          emittedTotal,
        )} does not reconcile with confirmed total ${moneyFromCents(expectedTotal)}`,
      );
    }

    return rows.map((row) => this.buildWorker(row));
  }

  private async loadRemittance(
    tenantId: string,
    paymentBatchId: string,
  ): Promise<RemittanceRow> {
    const rows = await this.databaseService.query<RemittanceRow>(
      `
      SELECT
        file.id::text,
        file.tenant_id::text,
        file.payroll_run_id::text,
        file.status::text,
        file.competence_year,
        file.competence_month,
        file.payment_date,
        file.total_amount::numeric(14,2)::text AS total_amount,
        COALESCE(sum(detail.amount) FILTER (
          WHERE COALESCE(NULLIF(detail.occurrence_code, ''), '00') IN ('0', '00', '000')
        ), 0)::numeric(14,2)::text AS confirmed_total
      FROM payroll.payment_remittance_file file
      LEFT JOIN payroll.payment_remittance_detail detail
        ON detail.file_id = file.id
       AND detail.tenant_id = file.tenant_id
      WHERE file.tenant_id = $1::uuid
        AND file.id = $2::uuid
      GROUP BY file.id
      `,
      [tenantId, paymentBatchId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Payment remittance file not found');
    return row;
  }

  private buildWorker(row: PaymentDetailRow): S1210BuildResult {
    const competence = `${row.competence_year}-${String(
      row.competence_month,
    ).padStart(2, '0')}`;
    const ideDmDev = row.payroll_run_id
      ? demoId(row.payroll_run_id, row.employee_id)
      : demoId(row.payment_batch_id, row.employee_id);
    const reference = eventId(
      'S-1210' as never,
      row.tenant_id,
      `${row.payment_batch_id}:${row.employee_id}`,
    );
    const paymentDate = dateOnly(
      row.payment_date,
      row.competence_year,
      row.competence_month,
    );
    const amount = money(row.amount);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtPgtos/v_S_01_03_00">
  <evtPgtos Id="${reference}">
    ${ideEventoFolhaMensal(competence)}
    ${ideEmpregadorXml(row.cnpj)}
    <ideBenef>
      <cpfBenef>${cpf(row.cpf)}</cpfBenef>
      <infoPgto>
        <dtPgto>${paymentDate}</dtPgto>
        <tpPgto>1</tpPgto>
        <perRef>${competence}</perRef>
        <ideDmDev>${ideDmDev}</ideDmDev>
        <vrLiq>${amount}</vrLiq>
      </infoPgto>
    </ideBenef>
  </evtPgtos>
</eSocial>`;

    return {
      tenantId: row.tenant_id,
      paymentBatchId: row.payment_batch_id,
      payrollRunId: row.payroll_run_id,
      employeeId: row.employee_id,
      xml,
      reference,
      competence,
      ideDmDev,
      vrLiq: amount,
      payload: {
        paymentBatchId: row.payment_batch_id,
        payrollRunId: row.payroll_run_id,
        employeeId: row.employee_id,
        ideDmDev,
        vrLiq: amount,
      },
    };
  }
}

function ideEventoFolhaMensal(competence: string): string {
  return `<ideEvento><indRetif>1</indRetif><perApur>${competence}</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>`;
}

function demoId(sourceId: string, employeeId: string): string {
  return `DM${sourceId.replace(/\D/g, '').slice(0, 10)}${employeeId
    .replace(/\D/g, '')
    .slice(0, 10)}`.slice(0, 30);
}

function dateOnly(
  value: Date | string | null | undefined,
  year: number,
  month: number,
): string {
  if (value) return new Date(value).toISOString().slice(0, 10);
  return new Date(Date.UTC(year, month - 1, 25)).toISOString().slice(0, 10);
}

function money(value: string): string {
  const [wholeRaw = '0', fractionRaw = ''] = String(value).split('.');
  const whole = wholeRaw.replace(/[^\d-]/g, '') || '0';
  const fraction = fractionRaw.replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
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
