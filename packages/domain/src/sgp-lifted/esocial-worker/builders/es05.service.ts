import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import {
  EmittedESocialEvent,
  ESocialEmitService,
} from '../esocial-emit.service';
import {
  ESocialTotalizerRecord,
  TotalizerParser,
} from '../parsers/totalizer.parser';
import { S1299Builder, S1299PendingPeriodic } from './s1299.builder';
import { dateCompetence, monthCompetence } from './s1299.builder';
import { sha256 } from './shared-worker-common';

export interface ES05ClosureState {
  competence: string;
  status: 'PENDING' | 'EMITTED' | 'ACCEPTED' | 'REJECTED' | null;
  recibo: string | null;
  emittedAt: string | null;
  acceptedAt: string | null;
  pending: S1299PendingPeriodic[];
  totalizers: ESocialTotalizerRecord[];
}

export interface ES05ClosureResult {
  competence: string;
  xmlHash: string;
  emitted: boolean;
  event: EmittedESocialEvent;
  state: ES05ClosureState;
}

export type ES05ReopenResult = ES05ClosureResult;

interface StateRow extends QueryResultRow {
  competence: Date | string;
  status: 'PENDING' | 'EMITTED' | 'ACCEPTED' | 'REJECTED';
  recibo: string | null;
  emitted_at: Date | string | null;
  accepted_at: Date | string | null;
}

interface TotalizerRow extends QueryResultRow {
  tenant_id: string;
  competence: Date | string;
  kind: ESocialTotalizerRecord['kind'];
  source_event_recibo: string;
  payload: Record<string, unknown> | string;
  received_at: Date | string;
}

@Injectable()
export class ES05Service {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emitService: ESocialEmitService,
    private readonly s1299Builder: S1299Builder,
    private readonly totalizerParser: TotalizerParser,
  ) {}

  async status(year: number, month: number): Promise<ES05ClosureState> {
    return this.loadState(competenceFromParts(year, month));
  }

  async close(year: number, month: number): Promise<ES05ClosureResult> {
    const tenantId = this.currentTenantId();
    const competence = competenceFromParts(year, month);
    const record = await this.s1299Builder.build(tenantId, competence);
    const xmlHash = sha256(record.xml);
    const event = await this.emitService.emit({
      tenantId,
      eventKind: 'S-1299',
      xml: record.xml,
      reference: record.reference,
      competence: record.competence,
      sourceEntityKind: 'esocial.s1299_emission_state',
      sourceEntityId: `${tenantId}:${record.competence}`,
      xmlHash,
      payload: record.payload,
    });

    await this.databaseService.query(
      `
      INSERT INTO esocial.s1299_emission_state (
        tenant_id,
        competence,
        recibo,
        emitted_at,
        status,
        emitted_event_id
      )
      VALUES ($1::uuid, $2::date, $3, now(), 'EMITTED'::esocial.s1299_emission_status, $4::uuid)
      ON CONFLICT (tenant_id, competence)
      DO UPDATE
      SET recibo = EXCLUDED.recibo,
          emitted_at = EXCLUDED.emitted_at,
          status = EXCLUDED.status,
          emitted_event_id = EXCLUDED.emitted_event_id,
          updated_at = now()
      `,
      [tenantId, dateCompetence(record.competence), event.reference, event.id],
    );

    return {
      competence,
      xmlHash,
      emitted: true,
      event,
      state: await this.loadState(competence),
    };
  }

  async ingestTotalizer(xml: string): Promise<ESocialTotalizerRecord> {
    return this.totalizerParser.ingest(this.currentTenantId(), xml);
  }

  async reopen(year: number, month: number): Promise<ES05ReopenResult> {
    void year;
    void month;
    throw new UnprocessableEntityException(
      'S-1298 lifted builder was promoted to the active DTO pipeline.',
    );
  }

  private async loadState(competence: string): Promise<ES05ClosureState> {
    const tenantId = this.currentTenantId();
    const [state] = await this.databaseService.query<StateRow>(
      `
      SELECT competence, status::text, recibo, emitted_at, accepted_at
      FROM esocial.s1299_emission_state
      WHERE tenant_id = $1::uuid
        AND competence = $2::date
      `,
      [tenantId, dateCompetence(competence)],
    );
    const totalizers = await this.databaseService.query<TotalizerRow>(
      `
      SELECT
        tenant_id::text,
        competence,
        kind::text,
        source_event_recibo,
        payload,
        received_at
      FROM esocial.esocial_totalizer
      WHERE tenant_id = $1::uuid
        AND competence = $2::date
      ORDER BY kind, received_at DESC
      `,
      [tenantId, dateCompetence(competence)],
    );
    return {
      competence,
      status: state?.status ?? null,
      recibo: state?.recibo ?? null,
      emittedAt: state?.emitted_at
        ? new Date(state.emitted_at).toISOString()
        : null,
      acceptedAt: state?.accepted_at
        ? new Date(state.accepted_at).toISOString()
        : null,
      pending: await this.s1299Builder.pending(tenantId, competence),
      totalizers: totalizers.map((row) => ({
        tenantId: row.tenant_id,
        competence:
          row.competence instanceof Date
            ? row.competence.toISOString().slice(0, 7)
            : String(row.competence).slice(0, 7),
        kind: row.kind,
        sourceEventRecibo: row.source_event_recibo,
        payload:
          typeof row.payload === 'string'
            ? (JSON.parse(row.payload) as Record<string, unknown>)
            : row.payload,
        receivedAt: new Date(row.received_at).toISOString(),
      })),
    };
  }

  private currentTenantId(): string {
    const context = RequestContextStore.get();
    const tenantId = context?.actor?.tenantId ?? context?.tenantId;
    if (!tenantId) {
      throw new UnprocessableEntityException(
        'Tenant context is required for ES-05 closure state',
      );
    }
    return tenantId;
  }
}

function competenceFromParts(year: number, month: number): string {
  return monthCompetence(`${year}-${String(month).padStart(2, '0')}`);
}
