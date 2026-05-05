import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import {
  EmittedESocialEvent,
  ESocialEmitService,
} from '../esocial-emit.service';

export type S1xxxEventKind =
  | 'S-1000'
  | 'S-1005'
  | 'S-1010'
  | 'S-1020'
  | 'S-1030'
  | 'S-1040'
  | 'S-1060'
  | 'S-1050'
  | 'S-1070';

export interface S1xxxSourceRecord {
  id: string;
  sourceEntityKind: string;
  xml: string;
  reference: string;
  competence: string;
  payload: Record<string, unknown>;
}

export interface S1xxxDispatchResult {
  eventKind: S1xxxEventKind;
  sourceEntityId: string;
  sourceEntityKind: string;
  xmlHash: string;
  emitted: boolean;
  event?: EmittedESocialEvent;
}

interface DispatchStateRow extends QueryResultRow {
  last_payload_hash: string | null;
}

export interface S1xxxBuilder {
  readonly eventKind: S1xxxEventKind;
  build(tenantId: string, competence: string): Promise<S1xxxSourceRecord[]>;
}

@Injectable()
export class S1xxxDispatchService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emitService: ESocialEmitService,
  ) {}

  async dispatch(
    builder: S1xxxBuilder,
    input: { tenantId?: string; competence?: string; force?: boolean },
  ): Promise<S1xxxDispatchResult[]> {
    const tenantId = input.tenantId ?? this.currentTenantId();
    const competence = input.competence ?? '2026-01';
    const records = await builder.build(tenantId, competence);
    const results: S1xxxDispatchResult[] = [];

    for (const record of records) {
      const xmlHash = sha256(record.xml);
      const current = await this.databaseService.query<DispatchStateRow>(
        `
        SELECT last_payload_hash
        FROM esocial.s1xxx_dispatch_state
        WHERE tenant_id = $1::uuid
          AND event_kind = $2::esocial.s1xxx_event_kind
          AND source_entity_id = $3
        `,
        [tenantId, builder.eventKind, record.id],
      );
      if (!input.force && current[0]?.last_payload_hash === xmlHash) {
        results.push({
          eventKind: builder.eventKind,
          sourceEntityId: record.id,
          sourceEntityKind: record.sourceEntityKind,
          xmlHash,
          emitted: false,
        });
        continue;
      }

      const event = await this.emitService.emit({
        tenantId,
        eventKind: builder.eventKind,
        xml: record.xml,
        reference: record.reference,
        competence: record.competence,
        sourceEntityKind: record.sourceEntityKind,
        sourceEntityId: record.id,
        xmlHash,
        payload: {
          ...record.payload,
          sourceEntityKind: record.sourceEntityKind,
          sourceEntityId: record.id,
        },
      });

      await this.databaseService.query(
        `
        INSERT INTO esocial.s1xxx_dispatch_state (
          tenant_id,
          event_kind,
          source_entity_id,
          last_emitted_at,
          last_payload_hash
        )
        VALUES ($1::uuid, $2::esocial.s1xxx_event_kind, $3, now(), $4)
        ON CONFLICT (tenant_id, event_kind, source_entity_id)
        DO UPDATE
        SET last_emitted_at = EXCLUDED.last_emitted_at,
            last_payload_hash = EXCLUDED.last_payload_hash
        `,
        [tenantId, builder.eventKind, record.id, xmlHash],
      );

      results.push({
        eventKind: builder.eventKind,
        sourceEntityId: record.id,
        sourceEntityKind: record.sourceEntityKind,
        xmlHash,
        emitted: true,
        event,
      });
    }

    return results;
  }

  async status(tenantId?: string): Promise<
    Array<{
      eventKind: S1xxxEventKind;
      sourceEntityId: string;
      lastEmittedAt: string | null;
      lastPayloadHash: string | null;
    }>
  > {
    const rows = await this.databaseService.query<
      QueryResultRow & {
        event_kind: S1xxxEventKind;
        source_entity_id: string;
        last_emitted_at: Date | string | null;
        last_payload_hash: string | null;
      }
    >(
      `
      SELECT event_kind::text, source_entity_id, last_emitted_at, last_payload_hash
      FROM esocial.s1xxx_dispatch_state
      WHERE tenant_id = $1::uuid
      ORDER BY event_kind, source_entity_id
      `,
      [tenantId ?? this.currentTenantId()],
    );
    return rows.map((row) => ({
      eventKind: row.event_kind,
      sourceEntityId: row.source_entity_id,
      lastEmittedAt: row.last_emitted_at
        ? new Date(row.last_emitted_at).toISOString()
        : null,
      lastPayloadHash: row.last_payload_hash,
    }));
  }

  private currentTenantId(): string {
    const context = RequestContextStore.get();
    const tenantId = context?.actor?.tenantId ?? context?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context is required for S-1xxx dispatch');
    }
    return tenantId;
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function eventId(
  eventKind: S1xxxEventKind,
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventKind}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}

export function onlyDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function employerRegistration(cnpj: string | null | undefined): string {
  const digits = onlyDigits(cnpj);
  return (digits.length >= 8 ? digits.slice(0, 8) : '12345678').padStart(
    8,
    '0',
  );
}

export function fullRegistration(cnpj: string | null | undefined): string {
  const digits = onlyDigits(cnpj);
  return (
    digits.length >= 14 ? digits.slice(0, 14) : '12345678000199'
  ).padStart(14, '0');
}

export function ideEvento(procEmi = '1'): string {
  return `<ideEvento><tpAmb>2</tpAmb><procEmi>${procEmi}</procEmi><verProc>SGP-0.0.1</verProc></ideEvento>`;
}

export function ideEmpregador(cnpjRoot: string): string {
  return `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${cnpjRoot}</nrInsc></ideEmpregador>`;
}
