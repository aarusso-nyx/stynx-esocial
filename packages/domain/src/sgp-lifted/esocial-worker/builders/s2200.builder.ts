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

interface EmployeeRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  registration: string;
  name: string;
  social_name: string | null;
  cpf: string | null;
  birth_date: Date | string | null;
  gender: string;
  email: string | null;
  phone: string | null;
  pis_pasep: string | null;
  mother_name: string | null;
  father_name: string | null;
  nationality_code: string | null;
  birth_city_code: string | null;
  marital_status: string | null;
  education_level: string | null;
  address: unknown;
  hired_on: Date | string | null;
  abono_permanencia_ativo: boolean;
  abono_permanencia_inicio: Date | string | null;
  contract_type: string | null;
  link_contract_type: string | null;
  job_position_name: string | null;
  job_function_name: string | null;
  exercise_on: Date | string | null;
  starts_on: Date | string | null;
  cnpj: string | null;
}

interface DependentRow extends QueryResultRow {
  name: string;
  cpf: string | null;
  birth_date: Date | string | null;
  relationship: string;
  income_tax_dependent: boolean;
}

@Injectable()
export class S2200Builder {
  readonly eventKind = 'S-2200' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(
    tenantId: string,
    employeeId: string,
    competence = '2026-01',
  ): Promise<S22xxSourceRecord> {
    const rows = await this.databaseService.query<EmployeeRow>(
      `
      SELECT
        e.id::text,
        e.tenant_id::text,
        e.registration,
        e.name,
        e.social_name,
        e.cpf,
        e.birth_date,
        e.gender::text,
        e.email,
        e.phone,
        e.pis_pasep,
        e.mother_name,
        e.father_name,
        e.nationality_code,
        e.birth_city_code,
        e.marital_status,
        e.education_level,
        e.address,
        e.hired_on,
        e.abono_permanencia_ativo,
        e.abono_permanencia_inicio,
        ct.code AS contract_type,
        el.contract_type AS link_contract_type,
        jp.name AS job_position_name,
        jf.name AS job_function_name,
        ec.exercise_on,
        ec.starts_on,
        company.cnpj
      FROM hr.employee e
      LEFT JOIN hr.contract_type ct ON ct.id = e.contract_type_id
      LEFT JOIN hr.employment_link el ON el.id = e.employment_link_id
      LEFT JOIN hr.job_position jp ON jp.id = e.job_position_id
      LEFT JOIN hr.job_function jf ON jf.id = e.job_function_id
      LEFT JOIN LATERAL (
        SELECT exercise_on, starts_on
        FROM hr.employment_contract
        WHERE tenant_id = e.tenant_id
          AND employee_id = e.id
        ORDER BY starts_on DESC, created_at DESC
        LIMIT 1
      ) ec ON true
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

    const id = eventId(this.eventKind, tenantId, employee.id);
    const exerciseDate = dateOnly(
      employee.exercise_on ?? employee.starts_on ?? employee.hired_on,
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00">
  <evtAdmissao Id="${id}">
    ${ideEvento()}
    ${ideEmpregadorXml(employee.cnpj)}
    <trabalhador>
      <cpfTrab>${cpf(employee.cpf)}</cpfTrab>
      <nmTrab>${cleanText(employee.name, 'Trabalhador')}</nmTrab>
      <sexo>${gender(employee.gender)}</sexo>
      <racaCor>1</racaCor>
      <estCiv>${employee.marital_status ?? '1'}</estCiv>
      <grauInstr>${employee.education_level ?? '07'}</grauInstr>
      ${employee.social_name ? `<nmSoc>${cleanText(employee.social_name, employee.name)}</nmSoc>` : ''}
      <nascimento><dtNascto>${dateOnly(employee.birth_date)}</dtNascto><paisNascto>105</paisNascto><paisNac>${employee.nationality_code ?? '105'}</paisNac></nascimento>
      ${addressXml(employee.address)}
      ${dependents.map(dependentXml).join('\n      ')}
      ${contactXml(employee.email, employee.phone)}
    </trabalhador>
    <vinculo>
      <matricula>${cleanText(employee.registration, employee.id).slice(0, 30)}</matricula>
      <tpRegTrab>2</tpRegTrab>
      <tpRegPrev>2</tpRegPrev>
      <cadIni>N</cadIni>
      <infoRegimeTrab><infoEstatutario><tpProv>${provisionType(employee)}</tpProv><dtExercicio>${exerciseDate}</dtExercicio><tpPlanRP>0</tpPlanRP><indTetoRGPS>N</indTetoRGPS><indAbonoPerm>${employee.abono_permanencia_ativo ? 'S' : 'N'}</indAbonoPerm>${employee.abono_permanencia_ativo ? `<dtIniAbono>${dateOnly(employee.abono_permanencia_inicio)}</dtIniAbono>` : ''}</infoEstatutario></infoRegimeTrab>
      <infoContrato><nmCargo>${cleanText(employee.job_position_name, 'Servidor Publico')}</nmCargo>${employee.job_function_name ? `<nmFuncao>${cleanText(employee.job_function_name, 'Funcao Publica')}</nmFuncao>` : ''}<acumCargo>N</acumCargo><codCateg>301</codCateg></infoContrato>
    </vinculo>
  </evtAdmissao>
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
        registration: employee.registration,
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

function provisionType(employee: EmployeeRow): string {
  const contract =
    `${employee.contract_type ?? ''} ${employee.link_contract_type ?? ''}`.toLowerCase();
  if (contract.includes('temporary')) return '7';
  if (contract.includes('commission')) return '2';
  return '1';
}
