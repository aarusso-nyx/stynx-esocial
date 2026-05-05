import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  addressXml,
  cleanText,
  contactXml,
  cpf,
  dateOnly,
  dependentXml,
  eventId,
  ideEmpregadorXml,
  ideEvento,
  S22xxSourceRecord,
} from './s22xx-common';

interface PendingRow extends QueryResultRow {
  id: string;
  field_path: string;
}

interface EmployeeRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  name: string;
  social_name: string | null;
  cpf: string | null;
  birth_date: Date | string | null;
  gender: string;
  email: string | null;
  phone: string | null;
  nationality_code: string | null;
  marital_status: string | null;
  education_level: string | null;
  address: unknown;
  cnpj: string | null;
  updated_at: Date | string;
}

interface DependentRow extends QueryResultRow {
  name: string;
  cpf: string | null;
  birth_date: Date | string | null;
  relationship: string;
  income_tax_dependent: boolean;
}

export interface S2205BuildResult {
  record: S22xxSourceRecord;
  pendingIds: string[];
}

@Injectable()
export class S2205Builder {
  readonly eventKind = 'S-2205' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async buildPending(
    tenantId: string,
    employeeId: string,
    competence = '2026-01',
  ): Promise<S2205BuildResult> {
    const pending = await this.databaseService.query<PendingRow>(
      `
      SELECT id::text, field_path
      FROM esocial.s2205_pending_alteration
      WHERE tenant_id = $1::uuid
        AND employee_id = $2::uuid
        AND status = 'PENDING'
      ORDER BY created_at ASC
      `,
      [tenantId, employeeId],
    );

    const record = await this.build(tenantId, employeeId, competence, pending);
    return {
      record,
      pendingIds: pending.map((row) => row.id),
    };
  }

  async build(
    tenantId: string,
    employeeId: string,
    competence = '2026-01',
    pending: PendingRow[] = [],
  ): Promise<S22xxSourceRecord> {
    const rows = await this.databaseService.query<EmployeeRow>(
      `
      SELECT
        e.id::text,
        e.tenant_id::text,
        e.name,
        e.social_name,
        e.cpf,
        e.birth_date,
        e.gender::text,
        e.email,
        e.phone,
        e.nationality_code,
        e.marital_status,
        e.education_level,
        e.address,
        e.updated_at,
        company.cnpj
      FROM hr.employee e
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = e.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE e.tenant_id = $1::uuid
        AND e.id = $2::uuid
      `,
      [tenantId, employeeId],
    );
    const employee = rows[0];
    if (!employee) throw new NotFoundException('Employee not found');

    const dependents = await this.databaseService.query<DependentRow>(
      `
      SELECT name, cpf, birth_date, relationship, income_tax_dependent
      FROM hr.employee_dependent
      WHERE tenant_id = $1::uuid
        AND employee_id = $2::uuid
      ORDER BY birth_date NULLS LAST, name
      `,
      [tenantId, employeeId],
    );

    const id = eventId(
      this.eventKind,
      tenantId,
      `${employee.id}:${pending.map((row) => row.id).join(':') || 'manual'}`,
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAltCadastral/v_S_01_03_00">
  <evtAltCadastral Id="${id}">
    ${ideEvento()}
    ${ideEmpregadorXml(employee.cnpj)}
    <ideTrabalhador><cpfTrab>${cpf(employee.cpf)}</cpfTrab></ideTrabalhador>
    <alteracao>
      <dtAlteracao>${dateOnly(employee.updated_at)}</dtAlteracao>
      <dadosTrabalhador>
        <nmTrab>${cleanText(employee.name, 'Trabalhador')}</nmTrab>
        <sexo>${gender(employee.gender)}</sexo>
        <racaCor>1</racaCor>
        <estCiv>${employee.marital_status ?? '1'}</estCiv>
        <grauInstr>${employee.education_level ?? '07'}</grauInstr>
        ${employee.social_name ? `<nmSoc>${cleanText(employee.social_name, employee.name)}</nmSoc>` : ''}
        <paisNac>${employee.nationality_code ?? '105'}</paisNac>
        ${addressXml(employee.address)}
        ${dependents.map(dependentXml).join('\n        ')}
        ${contactXml(employee.email, employee.phone)}
      </dadosTrabalhador>
    </alteracao>
  </evtAltCadastral>
</eSocial>`;

    return {
      id: employee.id,
      tenantId,
      employeeId: employee.id,
      sourceEntityKind: 'employee',
      xml,
      reference: id,
      competence,
      payload: {
        triggerFields: [...new Set(pending.map((row) => row.field_path))],
        dependentCount: dependents.length,
        sourceEntityKind: 'employee',
        sourceEntityId: employee.id,
      },
    };
  }
}

function gender(value: string): string {
  if (value === 'FEMALE') return 'F';
  if (value === 'MALE') return 'M';
  return 'M';
}
