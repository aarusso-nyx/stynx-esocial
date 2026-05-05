import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  employerRegistration,
  sha256,
  xmlEscape,
} from '../builders/s1xxx-common';
import { cleanText, cpf, dateOnly } from '../builders/s22xx-common';

export interface S2298BuildResult {
  orderId: string;
  tenantId: string;
  employmentLinkId: string;
  employeeId: string;
  eventKind: 'S-2298';
  xml: string;
  reference: string;
  competence: string;
  reintType: string;
  originalS2299Receipt: string;
  payload: Record<string, unknown>;
}

interface S2298Row extends QueryResultRow {
  order_id: string;
  tenant_id: string;
  employment_link_id: string;
  employee_id: string;
  employee_registration: string;
  employee_cpf: string | null;
  reinstatement_date: Date | string;
  decision_date: Date | string;
  kind: string;
  process_number: string | null;
  original_s2299_receipt: string | null;
  company_cnpj: string | null;
}

@Injectable()
export class S2298Builder {
  readonly eventKind = 'S-2298' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(orderId: string): Promise<S2298BuildResult> {
    const rows = await this.databaseService.query<S2298Row>(
      `
      SELECT
        order_row.id::text AS order_id,
        order_row.tenant_id::text,
        order_row.employment_link_id::text,
        employee.id::text AS employee_id,
        employee.registration AS employee_registration,
        employee.cpf AS employee_cpf,
        order_row.reinstatement_date,
        order_row.decision_date,
        order_row.kind::text,
        order_row.process_number,
        COALESCE(event.receipt_number, event.reference) AS original_s2299_receipt,
        company.cnpj AS company_cnpj
      FROM hr.reintegration_order order_row
      JOIN hr.employment_link link
        ON link.tenant_id = order_row.tenant_id
       AND link.id = order_row.employment_link_id
      JOIN hr.employee employee
        ON employee.tenant_id = order_row.tenant_id
       AND employee.employment_link_id = link.id
      JOIN public.esocial_event event
        ON event.tenant_id = order_row.tenant_id
       AND event.id = order_row.original_termination_event_id
      LEFT JOIN hr.branch branch
        ON branch.id = employee.branch_id
      LEFT JOIN hr.company company
        ON company.id = branch.company_id
      WHERE order_row.id = $1::uuid
      LIMIT 1
      `,
      [orderId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Reintegration order not found');

    const reintType = reintegrationType(row.kind);
    const receipt = cleanReceipt(row.original_s2299_receipt);
    const reference = eventId(this.eventKind, row.tenant_id, row.order_id);
    const reinstatementDate = dateOnly(row.reinstatement_date);
    const processXml =
      reintType === '1'
        ? `<nrProcJud>${xmlEscape(cleanProcessNumber(row.process_number))}</nrProcJud>`
        : '';
    const amnestyXml =
      reintType === '2'
        ? `<nrLeiAnistia>${xmlEscape(cleanText(row.process_number, 'ANISTIA2026').slice(0, 13))}</nrLeiAnistia>`
        : '';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtReintegr/v_S_01_03_00">
  <evtReintegr Id="${reference}">
    <ideEvento><indRetif>1</indRetif><nrRecibo>${receipt}</nrRecibo><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(row.company_cnpj)}</nrInsc></ideEmpregador>
    <ideVinculo><cpfTrab>${cpf(row.employee_cpf)}</cpfTrab><matricula>${xmlEscape(cleanText(row.employee_registration, row.employee_id).slice(0, 30))}</matricula></ideVinculo>
    <infoReintegr>
      <tpReint>${reintType}</tpReint>
      ${processXml}${amnestyXml}
      <dtEfetRetorno>${reinstatementDate}</dtEfetRetorno>
      <dtEfeito>${reinstatementDate}</dtEfeito>
    </infoReintegr>
  </evtReintegr>
</eSocial>`;

    return {
      orderId: row.order_id,
      tenantId: row.tenant_id,
      employmentLinkId: row.employment_link_id,
      employeeId: row.employee_id,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: reinstatementDate.slice(0, 7),
      reintType,
      originalS2299Receipt: receipt,
      payload: {
        orderId: row.order_id,
        employmentLinkId: row.employment_link_id,
        originalS2299Receipt: receipt,
        reintType,
        processNumber: row.process_number,
      },
    };
  }
}

function reintegrationType(kind: string): string {
  if (kind === 'JUDICIAL') return '1';
  if (kind === 'AMNESTY') return '2';
  return '9';
}

function eventId(
  eventKind: string,
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}

function cleanReceipt(value: string | null): string {
  const fallback = '1.2.0000000000000000000';
  const text = String(value ?? fallback).trim();
  return /^1\.\d\.\d{19}$/.test(text) ? text : fallback;
}

function cleanProcessNumber(value: string | null): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 20 ? digits : '12345678901234567890';
}
