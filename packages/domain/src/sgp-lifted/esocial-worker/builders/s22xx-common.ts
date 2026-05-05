import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import {
  EmittedESocialEvent,
  ESocialEmitService,
} from '../esocial-emit.service';
import { employerRegistration, onlyDigits, xmlEscape } from './s1xxx-common';

export type S22xxEventKind = 'S-2200' | 'S-2205' | 'S-2206';

export interface S22xxSourceRecord {
  id: string;
  tenantId: string;
  employeeId: string;
  sourceEntityKind: 'employee';
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

export interface S22xxDispatchResult {
  eventKind: S22xxEventKind;
  employeeId: string;
  xmlHash: string;
  emitted: boolean;
  blockedReason?: string;
  event?: EmittedESocialEvent;
}

interface S2200StateRow extends QueryResultRow {
  payload_hash: string | null;
}

export const S2205_TRIGGER_FIELDS = [
  'address.zip',
  'address.street',
  'contact.email',
  'contact.phone',
  'marital_status',
  'education_level',
  'dependent.*',
] as const;

export interface S22xxBuilder {
  readonly eventKind: S22xxEventKind;
}

@Injectable()
export class S22xxDispatchService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emitService: ESocialEmitService,
  ) {}

  async emitS2200(
    record: S22xxSourceRecord,
    input: { force?: boolean } = {},
  ): Promise<S22xxDispatchResult> {
    const xmlHash = sha256(record.xml);
    const current = await this.databaseService.query<S2200StateRow>(
      `
      SELECT payload_hash
      FROM esocial.s2200_emission_state
      WHERE tenant_id = $1::uuid
        AND employee_id = $2::uuid
      `,
      [record.tenantId, record.employeeId],
    );

    if (current[0]?.payload_hash === xmlHash) {
      if (input.force) {
        throw new ConflictException(
          'S-2200 reemission is blocked because payload_hash did not change',
        );
      }
      return {
        eventKind: 'S-2200',
        employeeId: record.employeeId,
        xmlHash,
        emitted: false,
        blockedReason: 'payload_hash_unchanged',
      };
    }

    const event = await this.emitService.emit({
      tenantId: record.tenantId,
      eventKind: 'S-2200',
      xml: record.xml,
      reference: record.reference,
      competence: record.competence,
      sourceEntityKind: record.sourceEntityKind,
      sourceEntityId: record.employeeId,
      xmlHash,
      payload: record.payload,
    });

    await this.databaseService.query(
      `
      INSERT INTO esocial.s2200_emission_state (
        tenant_id,
        employee_id,
        emitted_at,
        recibo,
        payload_hash
      )
      VALUES ($1::uuid, $2::uuid, now(), $3, $4)
      ON CONFLICT (tenant_id, employee_id)
      DO UPDATE
      SET emitted_at = EXCLUDED.emitted_at,
          recibo = EXCLUDED.recibo,
          payload_hash = EXCLUDED.payload_hash,
          updated_at = now()
      `,
      [record.tenantId, record.employeeId, event.reference, xmlHash],
    );

    return {
      eventKind: 'S-2200',
      employeeId: record.employeeId,
      xmlHash,
      emitted: true,
      event,
    };
  }

  async emitS2205(
    record: S22xxSourceRecord,
    pendingIds: string[],
  ): Promise<S22xxDispatchResult> {
    if (pendingIds.length === 0) {
      throw new BadRequestException('S-2205 emission requires pending changes');
    }
    const xmlHash = sha256(record.xml);
    const event = await this.emitService.emit({
      tenantId: record.tenantId,
      eventKind: 'S-2205',
      xml: record.xml,
      reference: record.reference,
      competence: record.competence,
      sourceEntityKind: record.sourceEntityKind,
      sourceEntityId: record.employeeId,
      xmlHash,
      payload: {
        ...record.payload,
        pendingAlterationIds: pendingIds,
      },
    });

    await this.databaseService.query(
      `
      UPDATE esocial.s2205_pending_alteration
      SET status = 'EMITTED',
          emitted_event_id = $3::uuid,
          consumed_at = now()
      WHERE tenant_id = $1::uuid
        AND id = ANY($2::uuid[])
      `,
      [record.tenantId, pendingIds, event.id],
    );

    return {
      eventKind: 'S-2205',
      employeeId: record.employeeId,
      xmlHash,
      emitted: true,
      event,
    };
  }

  currentTenantId(): string {
    const context = RequestContextStore.get();
    const tenantId = context?.actor?.tenantId ?? context?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context is required for S-22xx dispatch');
    }
    return tenantId;
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function eventId(
  eventKind: S22xxEventKind,
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}

export function ideEvento(): string {
  return '<ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>';
}

export function ideEmpregadorXml(cnpj: string | null | undefined): string {
  return `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(cnpj)}</nrInsc></ideEmpregador>`;
}

export function cpf(value: string | null | undefined): string {
  return onlyDigits(value).padStart(11, '0').slice(0, 11);
}

export function dateOnly(value: Date | string | null | undefined): string {
  if (!value) return '2000-01-01';
  return new Date(value).toISOString().slice(0, 10);
}

export function cleanText(
  value: string | null | undefined,
  fallback: string,
): string {
  const cleaned = String(value ?? fallback).trim();
  return xmlEscape(cleaned || fallback);
}

export function addressXml(address: unknown): string {
  const data = isRecord(address) ? address : {};
  const street = cleanText(
    stringProp(data, 'street') ?? stringProp(data, 'dscLograd'),
    'Rua Nao Informada',
  );
  const number = cleanText(
    stringProp(data, 'number') ?? stringProp(data, 'nrLograd'),
    'S/N',
  );
  const zip = onlyDigits(
    stringProp(data, 'zip') ?? stringProp(data, 'cep') ?? '70000000',
  )
    .padStart(8, '0')
    .slice(0, 8);
  const city = onlyDigits(
    stringProp(data, 'cityCode') ?? stringProp(data, 'codMunic') ?? '5300108',
  )
    .padStart(7, '0')
    .slice(0, 7);
  const uf = cleanText(
    (stringProp(data, 'state') ?? stringProp(data, 'uf') ?? 'DF').slice(0, 2),
    'DF',
  ).toUpperCase();
  const neighborhood =
    stringProp(data, 'neighborhood') ?? stringProp(data, 'bairro');
  return `<endereco><brasil><tpLograd>R</tpLograd><dscLograd>${street}</dscLograd><nrLograd>${number}</nrLograd>${neighborhood ? `<bairro>${cleanText(neighborhood, 'Centro')}</bairro>` : ''}<cep>${zip}</cep><codMunic>${city}</codMunic><uf>${uf}</uf></brasil></endereco>`;
}

export function contactXml(
  email?: string | null,
  phone?: string | null,
): string {
  const pieces: string[] = [];
  const digits = onlyDigits(phone);
  if (digits.length >= 8)
    pieces.push(`<fonePrinc>${digits.slice(0, 13)}</fonePrinc>`);
  if (email && email.includes('@') && email.length >= 6) {
    pieces.push(`<emailPrinc>${xmlEscape(email.slice(0, 60))}</emailPrinc>`);
  }
  return pieces.length ? `<contato>${pieces.join('')}</contato>` : '';
}

export function dependentXml(dependent: {
  name: string;
  cpf?: string | null;
  birth_date?: Date | string | null;
  income_tax_dependent?: boolean | null;
  relationship?: string | null;
}): string {
  const depCpf = cpf(dependent.cpf);
  const includeCpf = onlyDigits(dependent.cpf).length === 11;
  return `<dependente><tpDep>${dependentType(dependent.relationship)}</tpDep><nmDep>${cleanText(dependent.name, 'Dependente')}</nmDep><dtNascto>${dateOnly(dependent.birth_date)}</dtNascto>${includeCpf ? `<cpfDep>${depCpf}</cpfDep>` : ''}<depIRRF>${dependent.income_tax_dependent ? 'S' : 'N'}</depIRRF><depSF>N</depSF><incTrab>N</incTrab></dependente>`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringProp(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

function dependentType(relationship: string | null | undefined): string {
  const normalized = String(relationship ?? '').toLowerCase();
  if (normalized.includes('filh')) return '03';
  if (normalized.includes('conju') || normalized.includes('cônju')) return '01';
  return '99';
}
