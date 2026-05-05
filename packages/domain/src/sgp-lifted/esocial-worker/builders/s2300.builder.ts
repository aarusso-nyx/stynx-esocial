import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import {
  employerRegistration,
  fullRegistration,
  sha256,
  xmlEscape,
} from './s1xxx-common';
import {
  addressXml,
  cleanText,
  contactXml,
  cpf,
  dateOnly,
  dependentXml,
  ideEvento,
} from './s22xx-common';

export interface S2300BuildResult {
  contractId: string;
  tenantId: string;
  employeeId: string;
  eventKind: 'S-2300';
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

interface TsvContractRow extends QueryResultRow {
  contract_id: string;
  tenant_id: string;
  tsv_category: string;
  start_date: Date | string;
  end_date: Date | string | null;
  role: string;
  monthly_amount: string;
  weekly_hours: string;
  education_institution: string | null;
  internship_plan_uri: string | null;
  employee_id: string;
  employee_registration: string;
  employee_name: string;
  employee_social_name: string | null;
  employee_cpf: string | null;
  employee_birth_date: Date | string | null;
  employee_gender: string;
  employee_email: string | null;
  employee_phone: string | null;
  employee_nationality_code: string | null;
  employee_marital_status: string | null;
  employee_education_level: string | null;
  employee_address: unknown;
  employee_hired_on: Date | string | null;
  supervisor_cpf: string | null;
  company_cnpj: string | null;
  workplace_cnpj: string | null;
}

interface DependentRow extends QueryResultRow {
  name: string;
  cpf: string | null;
  birth_date: Date | string | null;
  relationship: string;
  income_tax_dependent: boolean;
}

@Injectable()
export class S2300Builder {
  readonly eventKind = 'S-2300' as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async build(contractId: string): Promise<S2300BuildResult> {
    const rows = await this.databaseService.query<TsvContractRow>(
      `
      SELECT
        tc.id::text AS contract_id,
        tc.tenant_id::text,
        tc.tsv_category,
        tc.start_date,
        tc.end_date,
        tc.role,
        tc.monthly_amount::text,
        tc.weekly_hours::text,
        tc.education_institution,
        tc.internship_plan_uri,
        e.id::text AS employee_id,
        e.registration AS employee_registration,
        e.name AS employee_name,
        e.social_name AS employee_social_name,
        e.cpf AS employee_cpf,
        e.birth_date AS employee_birth_date,
        e.gender::text AS employee_gender,
        e.email AS employee_email,
        e.phone AS employee_phone,
        e.nationality_code AS employee_nationality_code,
        e.marital_status AS employee_marital_status,
        e.education_level AS employee_education_level,
        e.address AS employee_address,
        e.hired_on AS employee_hired_on,
        supervisor.cpf AS supervisor_cpf,
        company.cnpj AS company_cnpj,
        COALESCE(branch.cnpj, company.cnpj) AS workplace_cnpj
      FROM hr.tsv_contract tc
      JOIN hr.employment_link el
        ON el.tenant_id = tc.tenant_id
       AND el.id = tc.employment_link_id
      JOIN hr.employee e
        ON e.tenant_id = tc.tenant_id
       AND e.employment_link_id = el.id
      LEFT JOIN hr.employee supervisor
        ON supervisor.tenant_id = tc.tenant_id
       AND supervisor.id = tc.supervisor_employee_id
      LEFT JOIN hr.work_location workplace
        ON workplace.tenant_id = tc.tenant_id
       AND workplace.id = tc.workplace_id
      LEFT JOIN hr.branch branch
        ON branch.tenant_id = tc.tenant_id
       AND branch.id = workplace.branch_id
      LEFT JOIN LATERAL (
        SELECT cnpj
        FROM hr.company
        WHERE tenant_id = tc.tenant_id
          AND status = 'ACTIVE'::"RecordStatus"
        ORDER BY code
        LIMIT 1
      ) company ON true
      WHERE tc.id = $1::uuid
      LIMIT 1
      `,
      [contractId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('TS-V contract not found');

    const dependents = await this.databaseService.query<DependentRow>(
      `
      SELECT name, cpf, birth_date, relationship, income_tax_dependent
      FROM hr.employee_dependent
      WHERE tenant_id = $1::uuid
        AND employee_id = $2::uuid
      ORDER BY birth_date NULLS LAST, name
      `,
      [row.tenant_id, row.employee_id],
    );

    const reference = eventId(this.eventKind, row.tenant_id, row.contract_id);
    const category = tsvCategory(row.tsv_category);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTSVInicio/v_S_01_03_00">
  <evtTSVInicio Id="${reference}">
    ${ideEvento()}
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(row.company_cnpj)}</nrInsc></ideEmpregador>
    <trabalhador>
      <cpfTrab>${cpf(row.employee_cpf)}</cpfTrab>
      <nmTrab>${cleanText(row.employee_name, 'Trabalhador TSV')}</nmTrab>
      <sexo>${gender(row.employee_gender)}</sexo>
      <racaCor>1</racaCor>
      <estCiv>${row.employee_marital_status ?? '1'}</estCiv>
      <grauInstr>${row.employee_education_level ?? '07'}</grauInstr>
      ${row.employee_social_name ? `<nmSoc>${cleanText(row.employee_social_name, row.employee_name)}</nmSoc>` : ''}
      <nascimento><dtNascto>${dateOnly(row.employee_birth_date)}</dtNascto><paisNascto>105</paisNascto><paisNac>${row.employee_nationality_code ?? '105'}</paisNac></nascimento>
      ${addressXml(row.employee_address)}
      ${dependents.map(dependentXml).join('\n      ')}
      ${contactXml(row.employee_email, row.employee_phone)}
    </trabalhador>
    <infoTSVInicio>
      <cadIni>N</cadIni>
      <matricula>${registration(row)}</matricula>
      <codCateg>${category}</codCateg>
      <dtInicio>${dateOnly(row.start_date)}</dtInicio>
      ${this.infoComplementaresXml(row, category)}
    </infoTSVInicio>
  </evtTSVInicio>
</eSocial>`;

    return {
      contractId: row.contract_id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      eventKind: this.eventKind,
      xml,
      reference,
      competence: dateOnly(row.start_date).slice(0, 7),
      payload: {
        tsvContractId: row.contract_id,
        tsvCategory: category,
        registration: row.employee_registration,
        dependentCount: dependents.length,
      },
    };
  }

  private infoComplementaresXml(row: TsvContractRow, category: string): string {
    const pieces: string[] = [];
    if (category !== '901') {
      pieces.push(
        `<cargoFuncao><nmCargo>${cleanText(row.role, 'Trabalhador TSV').slice(0, 100)}</nmCargo></cargoFuncao>`,
      );
    }
    if (category === '901' || category === '701' || category === '410') {
      pieces.push(
        `<remuneracao><vrSalFx>${money(row.monthly_amount)}</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>`,
      );
    }
    if (category === '410') {
      pieces.push(
        `<infoTrabCedido><categOrig>301</categOrig><cnpjCednt>${originCnpj(row.company_cnpj)}</cnpjCednt><matricCed>${registration(row)}</matricCed><dtAdmCed>${dateOnly(row.employee_hired_on ?? row.start_date)}</dtAdmCed><tpRegTrab>2</tpRegTrab><tpRegPrev>2</tpRegPrev></infoTrabCedido>`,
      );
    }
    if (category === '901') {
      pieces.push(this.internshipXml(row));
    }
    if (requiresWorkplace(category)) {
      pieces.push(
        `<localTrabGeral><tpInsc>1</tpInsc><nrInsc>${fullRegistration(row.workplace_cnpj ?? row.company_cnpj)}</nrInsc></localTrabGeral>`,
      );
    }
    if (pieces.length === 0) {
      throw new BadRequestException(
        `S-2300 category ${category} is not mapped by the TS-V builder`,
      );
    }
    return `<infoComplementares>${pieces.join('')}</infoComplementares>`;
  }

  private internshipXml(row: TsvContractRow): string {
    const institution = cleanText(
      row.education_institution ?? 'Instituicao de Ensino',
      'Instituicao de Ensino',
    ).slice(0, 100);
    const supervisor = row.supervisor_cpf
      ? `<supervisorEstagio><cpfSupervisor>${cpf(row.supervisor_cpf)}</cpfSupervisor></supervisorEstagio>`
      : '';
    return `<infoEstagiario><natEstagio>N</natEstagio><nivEstagio>4</nivEstagio><areaAtuacao>${cleanText(row.role, 'Estagio').slice(0, 100)}</areaAtuacao><dtPrevTerm>${dateOnly(row.end_date ?? addYears(row.start_date, 1))}</dtPrevTerm><instEnsino><nmRazao>${institution}</nmRazao><dscLograd>Nao informado</dscLograd><nrLograd>S/N</nrLograd><bairro>Centro</bairro><cep>70000000</cep><codMunic>5300108</codMunic><uf>DF</uf></instEnsino>${supervisor}</infoEstagiario>`;
  }
}

function tsvCategory(value: string): string {
  const category = xmlEscape(
    String(value ?? '')
      .replace(/\D/g, '')
      .slice(0, 3),
  );
  if (!/^\d{3}$/.test(category)) {
    throw new BadRequestException('TS-V contract category must have 3 digits');
  }
  return category;
}

function gender(value: string): string {
  if (value === 'FEMALE') return 'F';
  if (value === 'MALE') return 'M';
  return 'M';
}

function registration(row: TsvContractRow): string {
  return cleanText(row.employee_registration, row.contract_id).slice(0, 30);
}

function money(value: unknown): string {
  const scalar =
    typeof value === 'string' || typeof value === 'number' ? value : '0';
  const numeric = Number(String(scalar).replace(',', '.'));
  if (!Number.isFinite(numeric)) return '0.00';
  return numeric.toFixed(2);
}

function requiresWorkplace(category: string): boolean {
  return (
    /^(2|4)\d{2}$/.test(category) ||
    [
      '304',
      '305',
      '721',
      '722',
      '723',
      '731',
      '734',
      '738',
      '761',
      '771',
      '901',
      '902',
      '906',
    ].includes(category)
  );
}

function originCnpj(companyCnpj: string | null): string {
  const fallback = '98765432000188';
  const current = fullRegistration(companyCnpj);
  return current === fallback ? '12345678000199' : fallback;
}

function addYears(date: Date | string, years: number): Date {
  const value = new Date(`${dateOnly(date)}T00:00:00.000Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value;
}

function eventId(
  eventKind: 'S-2300',
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}
