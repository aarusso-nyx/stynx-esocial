import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import {
  EmittedESocialEvent,
  ESocialEmitService,
} from '../esocial-emit.service';
import { S2210Builder } from './s2210.builder';
import { S2230Builder } from './s2230.builder';
import { S2220Builder } from './s2220.builder';
import { S2240Builder } from './s2240.builder';
import { S2299Builder } from './s2299.builder';
import { sha256 } from './s22xx-common';

export interface ES03DispatchResult {
  eventKind: 'S-2210' | 'S-2220' | 'S-2230' | 'S-2240' | 'S-2299';
  pendingId: string;
  sourceEntityId: string;
  xmlHash: string;
  emitted: boolean;
  event?: EmittedESocialEvent;
  lastError?: string;
}

interface PendingStatusRow extends QueryResultRow {
  id: string;
  event_kind: 'S-2210' | 'S-2220' | 'S-2230' | 'S-2240' | 'S-2299';
  source_id: string;
  employee_name: string;
  status: string;
  enqueued_at: Date | string;
  receipt: string | null;
  blocked_reason: string | null;
  last_error: string | null;
  aso_record_id: string | null;
  cat_emission_id: string | null;
  cat_kind: string | null;
  environmental_exposure_id: string | null;
  trigger_event: string | null;
}

@Injectable()
export class ES03Service {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emitService: ESocialEmitService,
    private readonly s2210Builder: S2210Builder,
    private readonly s2230Builder: S2230Builder,
    private readonly s2220Builder: S2220Builder,
    private readonly s2240Builder: S2240Builder,
    private readonly s2299Builder: S2299Builder,
  ) {}

  async listStatus(): Promise<
    Array<{
      id: string;
      eventKind: 'S-2210' | 'S-2220' | 'S-2230' | 'S-2240' | 'S-2299';
      sourceId: string;
      employeeName: string;
      status: string;
      enqueuedAt: string;
      receipt: string | null;
      blockedReason: string | null;
      lastError: string | null;
      asoRecordId: string | null;
      catEmissionId: string | null;
      catKind: string | null;
      environmentalExposureId: string | null;
      triggerEvent: string | null;
    }>
  > {
    const tenantId = this.currentTenantId();
    const rows = await this.withSstPermissions(() =>
      this.databaseService.query<PendingStatusRow>(
        `
      SELECT
        pending.cat_emission_id::text AS id,
        'S-2210'::text AS event_kind,
        pending.cat_emission_id::text AS source_id,
        employee.name AS employee_name,
        CASE WHEN cat.esocial_event_id IS NULL THEN 'PENDING' ELSE event.status::text END AS status,
        pending.enqueued_at,
        event.reference AS receipt,
        CASE WHEN cat.deadline_at < now() AND cat.esocial_event_id IS NULL THEN 'cat_deadline_expired' ELSE NULL END AS blocked_reason,
        pending.last_error,
        NULL::text AS aso_record_id,
        pending.cat_emission_id::text AS cat_emission_id,
        cat.cat_kind::text AS cat_kind,
        NULL::text AS environmental_exposure_id,
        NULL::text AS trigger_event
      FROM esocial.s2210_pending pending
      JOIN saude.cat_emission cat ON cat.id = pending.cat_emission_id
      JOIN saude.work_accident accident ON accident.id = cat.work_accident_id
      JOIN hr.employee employee ON employee.id = accident.employee_id
      LEFT JOIN public.esocial_event event ON event.id = cat.esocial_event_id
      WHERE pending.tenant_id = $1::uuid
      UNION ALL
      SELECT
        pending.aso_record_id::text AS id,
        'S-2220'::text AS event_kind,
        pending.aso_record_id::text AS source_id,
        employee.name AS employee_name,
        CASE WHEN aso.s2220_event_id IS NULL THEN 'PENDING' ELSE event.status::text END AS status,
        pending.enqueued_at,
        event.reference AS receipt,
        NULL::text AS blocked_reason,
        pending.last_error,
        pending.aso_record_id::text,
        NULL::text AS cat_emission_id,
        NULL::text AS cat_kind,
        NULL::text AS environmental_exposure_id,
        NULL::text AS trigger_event
      FROM esocial.s2220_pending pending
      JOIN saude.aso_record aso ON aso.id = pending.aso_record_id
      JOIN hr.employee employee ON employee.id = aso.employee_id
      LEFT JOIN public.esocial_event event ON event.id = aso.s2220_event_id
      WHERE pending.tenant_id = $1::uuid
      UNION ALL
      SELECT
        pending.environmental_exposure_id::text || ':' || pending.trigger_event::text AS id,
        'S-2240'::text AS event_kind,
        pending.environmental_exposure_id::text AS source_id,
        employee.name AS employee_name,
        'PENDING'::text AS status,
        pending.enqueued_at,
        NULL::text AS receipt,
        NULL::text AS blocked_reason,
        pending.last_error,
        NULL::text AS aso_record_id,
        NULL::text AS cat_emission_id,
        NULL::text AS cat_kind,
        pending.environmental_exposure_id::text,
        pending.trigger_event::text
      FROM esocial.s2240_pending pending
      JOIN saude.environmental_exposure exposure
        ON exposure.id = pending.environmental_exposure_id
      JOIN hr.employee employee ON employee.id = exposure.employee_id
      WHERE pending.tenant_id = $1::uuid
      UNION ALL
      SELECT
        pending.id::text,
        'S-2230'::text AS event_kind,
        pending.leave_or_vacation_id::text AS source_id,
        employee.name AS employee_name,
        pending.status::text,
        pending.enqueued_at,
        event.reference AS receipt,
        NULL::text AS blocked_reason,
        NULL::text AS last_error,
        NULL::text AS aso_record_id,
        NULL::text AS cat_emission_id,
        NULL::text AS cat_kind,
        NULL::text AS environmental_exposure_id,
        NULL::text AS trigger_event
      FROM esocial.s2230_pending pending
      LEFT JOIN hr.leave_record leave_record
        ON pending.kind = 'LEAVE'
       AND leave_record.id = pending.leave_or_vacation_id
      LEFT JOIN hr.vacation_record vacation
        ON pending.kind = 'VACATION'
       AND vacation.id = pending.leave_or_vacation_id
      JOIN hr.employee employee
        ON employee.id = COALESCE(leave_record.employee_id, vacation.employee_id)
      LEFT JOIN public.esocial_event event ON event.id = pending.emitted_event_id
      WHERE pending.tenant_id = $1::uuid
      UNION ALL
      SELECT
        pending.id::text,
        'S-2299'::text AS event_kind,
        pending.employment_link_id::text AS source_id,
        employee.name AS employee_name,
        pending.status::text,
        pending.ready_at AS enqueued_at,
        event.reference AS receipt,
        CASE WHEN run.status <> 'GENERATED'::"PayrollRunStatus" THEN 'payroll_run_not_generated' ELSE NULL END,
        NULL::text AS last_error,
        NULL::text AS aso_record_id,
        NULL::text AS cat_emission_id,
        NULL::text AS cat_kind,
        NULL::text AS environmental_exposure_id,
        NULL::text AS trigger_event
      FROM esocial.s2299_pending pending
      JOIN hr.employee employee ON employee.id = pending.employee_id
      JOIN payroll.payroll_run run ON run.id = pending.calc_run_id
      LEFT JOIN public.esocial_event event ON event.id = pending.emitted_event_id
      WHERE pending.tenant_id = $1::uuid
      ORDER BY enqueued_at DESC
      `,
        [tenantId],
      ),
    );
    return rows.map((row) => ({
      id: row.id,
      eventKind: row.event_kind,
      sourceId: row.source_id,
      employeeName: row.employee_name,
      status: row.status,
      enqueuedAt: new Date(row.enqueued_at).toISOString(),
      receipt: row.receipt,
      blockedReason: row.blocked_reason,
      lastError: row.last_error,
      asoRecordId: row.aso_record_id,
      catEmissionId: row.cat_emission_id,
      catKind: row.cat_kind,
      environmentalExposureId: row.environmental_exposure_id,
      triggerEvent: row.trigger_event,
    }));
  }

  async emitS2210(catEmissionId: string): Promise<ES03DispatchResult> {
    const tenantId = this.currentTenantId();
    return this.withSstPermissions(async () => {
      const record = await this.s2210Builder.buildPending(
        tenantId,
        catEmissionId,
      );
      const xmlHash = sha256(record.xml);
      try {
        const event = await this.emitService.emit({
          tenantId,
          eventKind: 'S-2210',
          xml: record.xml,
          reference: record.reference,
          competence: record.competence,
          sourceEntityKind: 'saude.cat_emission',
          sourceEntityId: record.catEmissionId,
          xmlHash,
          payload: record.payload,
        });
        await this.databaseService.query(
          `
          UPDATE saude.cat_emission
          SET esocial_event_id = $3::uuid
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
          `,
          [tenantId, record.catEmissionId, event.id],
        );
        await this.databaseService.query(
          `
          DELETE FROM esocial.s2210_pending
          WHERE tenant_id = $1::uuid
            AND cat_emission_id = $2::uuid
          `,
          [tenantId, record.catEmissionId],
        );
        return {
          eventKind: 'S-2210',
          pendingId: record.pendingId,
          sourceEntityId: record.catEmissionId,
          xmlHash,
          emitted: true,
          event,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.databaseService.query(
          `
          UPDATE esocial.s2210_pending
          SET attempts = attempts + 1,
              last_error = $3,
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND cat_emission_id = $2::uuid
          `,
          [tenantId, record.catEmissionId, message.slice(0, 1000)],
        );
        return {
          eventKind: 'S-2210',
          pendingId: record.pendingId,
          sourceEntityId: record.catEmissionId,
          xmlHash,
          emitted: false,
          lastError: message,
        };
      }
    });
  }

  async emitS2220(asoRecordId: string): Promise<ES03DispatchResult> {
    const tenantId = this.currentTenantId();
    return this.withSstPermissions(async () => {
      const record = await this.s2220Builder.buildPending(
        tenantId,
        asoRecordId,
      );
      const xmlHash = sha256(record.xml);
      try {
        const event = await this.emitService.emit({
          tenantId,
          eventKind: 'S-2220',
          xml: record.xml,
          reference: record.reference,
          competence: record.competence,
          sourceEntityKind: 'saude.aso_record',
          sourceEntityId: record.asoRecordId,
          xmlHash,
          payload: record.payload,
        });
        await this.databaseService.query(
          `
          UPDATE saude.aso_record
          SET s2220_event_id = $3::uuid
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
          `,
          [tenantId, record.asoRecordId, event.id],
        );
        await this.databaseService.query(
          `
          DELETE FROM esocial.s2220_pending
          WHERE tenant_id = $1::uuid
            AND aso_record_id = $2::uuid
          `,
          [tenantId, record.asoRecordId],
        );
        return {
          eventKind: 'S-2220',
          pendingId: record.pendingId,
          sourceEntityId: record.asoRecordId,
          xmlHash,
          emitted: true,
          event,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.databaseService.query(
          `
          UPDATE esocial.s2220_pending
          SET attempts = attempts + 1,
              last_error = $3,
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND aso_record_id = $2::uuid
          `,
          [tenantId, record.asoRecordId, message.slice(0, 1000)],
        );
        return {
          eventKind: 'S-2220',
          pendingId: record.pendingId,
          sourceEntityId: record.asoRecordId,
          xmlHash,
          emitted: false,
          lastError: message,
        };
      }
    });
  }

  async emitS2240(
    environmentalExposureId: string,
    triggerEvent: 'START' | 'END' | 'CHANGE',
  ): Promise<ES03DispatchResult> {
    const tenantId = this.currentTenantId();
    return this.withSstPermissions(async () => {
      const record = await this.s2240Builder.buildPending(
        tenantId,
        environmentalExposureId,
        triggerEvent,
      );
      const xmlHash = sha256(record.xml);
      try {
        const event = await this.emitService.emit({
          tenantId,
          eventKind: 'S-2240',
          xml: record.xml,
          reference: record.reference,
          competence: record.competence,
          sourceEntityKind: 'saude.environmental_exposure',
          sourceEntityId: record.environmentalExposureId,
          xmlHash,
          payload: record.payload,
        });
        await this.databaseService.query(
          `
          DELETE FROM esocial.s2240_pending
          WHERE tenant_id = $1::uuid
            AND environmental_exposure_id = $2::uuid
            AND trigger_event = $3::esocial.s2240_trigger_event
          `,
          [tenantId, record.environmentalExposureId, record.triggerEvent],
        );
        return {
          eventKind: 'S-2240',
          pendingId: record.pendingId,
          sourceEntityId: record.environmentalExposureId,
          xmlHash,
          emitted: true,
          event,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.databaseService.query(
          `
          UPDATE esocial.s2240_pending
          SET attempts = attempts + 1,
              last_error = $4,
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND environmental_exposure_id = $2::uuid
            AND trigger_event = $3::esocial.s2240_trigger_event
          `,
          [
            tenantId,
            record.environmentalExposureId,
            record.triggerEvent,
            message.slice(0, 1000),
          ],
        );
        return {
          eventKind: 'S-2240',
          pendingId: record.pendingId,
          sourceEntityId: record.environmentalExposureId,
          xmlHash,
          emitted: false,
          lastError: message,
        };
      }
    });
  }

  async emitS2230(pendingId: string): Promise<ES03DispatchResult> {
    const tenantId = this.currentTenantId();
    const record = await this.s2230Builder.buildPending(tenantId, pendingId);
    const xmlHash = sha256(record.xml);
    const event = await this.emitService.emit({
      tenantId,
      eventKind: 'S-2230',
      xml: record.xml,
      reference: record.reference,
      competence: record.competence,
      sourceEntityKind: record.sourceEntityKind,
      sourceEntityId: record.sourceEntityId,
      xmlHash,
      payload: record.payload,
    });
    await this.databaseService.query(
      `
      UPDATE esocial.s2230_pending
      SET status = 'EMITTED',
          emitted_event_id = $3::uuid,
          consumed_at = now()
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      `,
      [tenantId, pendingId, event.id],
    );
    return {
      eventKind: 'S-2230',
      pendingId,
      sourceEntityId: record.sourceEntityId,
      xmlHash,
      emitted: true,
      event,
    };
  }

  async emitS2299(pendingId: string): Promise<ES03DispatchResult> {
    const tenantId = this.currentTenantId();
    const record = await this.s2299Builder.buildPending(tenantId, pendingId);
    const xmlHash = sha256(record.xml);
    const event = await this.emitService.emit({
      tenantId,
      eventKind: 'S-2299',
      xml: record.xml,
      reference: record.reference,
      competence: record.competence,
      sourceEntityKind: 'hr.employment_link',
      sourceEntityId: record.employmentLinkId,
      xmlHash,
      payload: record.payload,
    });
    await this.databaseService.query(
      `
      UPDATE esocial.s2299_pending
      SET status = 'EMITTED',
          emitted_event_id = $3::uuid,
          consumed_at = now()
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      `,
      [tenantId, pendingId, event.id],
    );
    return {
      eventKind: 'S-2299',
      pendingId,
      sourceEntityId: record.employmentLinkId,
      xmlHash,
      emitted: true,
      event,
    };
  }

  private currentTenantId(): string {
    const context = RequestContextStore.get();
    const tenantId = context?.actor?.tenantId ?? context?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context is required for ES-03 dispatch');
    }
    return tenantId;
  }

  private withSstPermissions<T>(callback: () => Promise<T>): Promise<T> {
    const context = RequestContextStore.get();
    const permissions = new Set([
      ...(context?.actor?.permissions ?? context?.permissions ?? []),
      'esocial.event.read',
      'esocial.event.write',
      'saude.aso.read',
      'saude.aso.write',
      'saude.cat.read',
      'saude.cat.write',
      'saude.exposure.read',
      'saude.exposure.write',
      'saude.epi.read',
      'saude.epi.write',
    ]);
    return RequestContextStore.run(
      {
        ...context,
        actor: context?.actor
          ? { ...context.actor, permissions: [...permissions] }
          : undefined,
        tenantId:
          context?.actor?.tenantId ??
          context?.tenantId ??
          this.currentTenantId(),
        permissions: [...permissions],
      },
      callback,
    );
  }
}
