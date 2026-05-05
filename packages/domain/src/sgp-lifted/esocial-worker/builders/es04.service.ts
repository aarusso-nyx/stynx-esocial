import { ConflictException, Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import { PisPasepService } from '../../folha-pagamento/pis-pasep/pis-pasep.service';
import {
  ESocialEmitService,
  EmittedESocialEvent,
} from '../esocial-emit.service';
import { S1200Builder } from './s1200.builder';
import { S1202Builder } from './s1202.builder';
import { S1210Builder } from './s1210.builder';
import { sha256 } from './s22xx-common';

export interface ES04DispatchResult {
  eventKind: 'S-1200' | 'S-1202' | 'S-1210';
  employeeId: string;
  payrollRunId?: string | null;
  paymentBatchId?: string;
  xmlHash: string;
  emitted: boolean;
  blockedReason?: string;
  event?: EmittedESocialEvent;
}

interface StatusRow extends QueryResultRow {
  payroll_run_id: string;
  payment_batch_id: string | null;
  employee_id: string;
  registration: string;
  name: string;
  payroll_status: string;
  payment_status: string | null;
  s1200_recibo: string | null;
  s1200_emitted_at: Date | string | null;
  s1210_recibo: string | null;
  s1210_emitted_at: Date | string | null;
}

interface StateRow extends QueryResultRow {
  payload_hash: string | null;
}

@Injectable()
export class ES04Service {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emitService: ESocialEmitService,
    private readonly s1200Builder: S1200Builder,
    private readonly s1202Builder: S1202Builder,
    private readonly s1210Builder: S1210Builder,
    private readonly pisPasepService: PisPasepService,
  ) {}

  async listStatus(
    competenceYear: number,
    competenceMonth: number,
  ): Promise<
    Array<{
      payrollRunId: string;
      paymentBatchId: string | null;
      employeeId: string;
      registration: string;
      name: string;
      payrollStatus: string;
      paymentStatus: string | null;
      s1200Receipt: string | null;
      s1200EmittedAt: string | null;
      s1210Receipt: string | null;
      s1210EmittedAt: string | null;
    }>
  > {
    const tenantId = this.currentTenantId();
    const rows = await this.databaseService.query<StatusRow>(
      `
      WITH run_workers AS (
        SELECT DISTINCT
          run.id AS payroll_run_id,
          employee.id AS employee_id,
          employee.registration,
          employee.name,
          run.status::text AS payroll_status
        FROM payroll.payroll_run run
        JOIN payroll.employee_payroll_item item
          ON item.payroll_run_id = run.id
         AND item.tenant_id = run.tenant_id
         AND item.deleted_at IS NULL
        JOIN hr.employee employee
          ON employee.id = item.employee_id
         AND employee.tenant_id = item.tenant_id
        WHERE run.tenant_id = $1::uuid
          AND run.competence_year = $2
          AND run.competence_month = $3
      ),
      payment AS (
        SELECT DISTINCT ON (file.payroll_run_id)
          file.payroll_run_id,
          file.id AS payment_batch_id,
          file.status::text AS payment_status
        FROM payroll.payment_remittance_file file
        WHERE file.tenant_id = $1::uuid
          AND file.competence_year = $2
          AND file.competence_month = $3
        ORDER BY file.payroll_run_id, file.updated_at DESC
      )
      SELECT
        run_workers.payroll_run_id::text,
        payment.payment_batch_id::text,
        run_workers.employee_id::text,
        run_workers.registration,
        run_workers.name,
        run_workers.payroll_status,
        payment.payment_status,
        s1200.recibo AS s1200_recibo,
        s1200.emitted_at AS s1200_emitted_at,
        s1210.recibo AS s1210_recibo,
        s1210.emitted_at AS s1210_emitted_at
      FROM run_workers
      LEFT JOIN payment ON payment.payroll_run_id = run_workers.payroll_run_id
      LEFT JOIN esocial.s1200_emission_state s1200
        ON s1200.tenant_id = $1::uuid
       AND s1200.payroll_run_id = run_workers.payroll_run_id
       AND s1200.employee_id = run_workers.employee_id
      LEFT JOIN esocial.s1210_emission_state s1210
        ON s1210.tenant_id = $1::uuid
       AND s1210.payment_batch_id = payment.payment_batch_id
       AND s1210.employee_id = run_workers.employee_id
      ORDER BY run_workers.registration
      `,
      [tenantId, competenceYear, competenceMonth],
    );

    return rows.map((row) => ({
      payrollRunId: row.payroll_run_id,
      paymentBatchId: row.payment_batch_id,
      employeeId: row.employee_id,
      registration: row.registration,
      name: row.name,
      payrollStatus: row.payroll_status,
      paymentStatus: row.payment_status,
      s1200Receipt: row.s1200_recibo,
      s1200EmittedAt: row.s1200_emitted_at
        ? new Date(row.s1200_emitted_at).toISOString()
        : null,
      s1210Receipt: row.s1210_recibo,
      s1210EmittedAt: row.s1210_emitted_at
        ? new Date(row.s1210_emitted_at).toISOString()
        : null,
    }));
  }

  async emitS1200(
    payrollRunId: string,
    input: { employeeId?: string; force?: boolean } = {},
  ): Promise<ES04DispatchResult[]> {
    const tenantId = this.currentTenantId();
    const records = await this.s1200Builder.build(
      tenantId,
      payrollRunId,
      input.employeeId,
    );
    const results: ES04DispatchResult[] = [];

    for (const record of records) {
      const xmlHash = sha256(record.xml);
      const current = await this.databaseService.query<StateRow>(
        `
        SELECT payload_hash
        FROM esocial.s1200_emission_state
        WHERE tenant_id = $1::uuid
          AND payroll_run_id = $2::uuid
          AND employee_id = $3::uuid
        `,
        [tenantId, record.payrollRunId, record.employeeId],
      );
      if (current[0]?.payload_hash === xmlHash && !input.force) {
        results.push({
          eventKind: 'S-1200',
          employeeId: record.employeeId,
          payrollRunId: record.payrollRunId,
          xmlHash,
          emitted: false,
          blockedReason: 'payload_hash_unchanged',
        });
        continue;
      }
      if (current[0]?.payload_hash === xmlHash && input.force) {
        throw new ConflictException(
          'S-1200 reemission is blocked because payload_hash did not change',
        );
      }

      const event = await this.emitService.emit({
        tenantId,
        eventKind: 'S-1200',
        xml: record.xml,
        reference: record.reference,
        competence: record.competence,
        sourceEntityKind: 'payroll.payroll_run',
        sourceEntityId: record.payrollRunId,
        payrollRunId: record.payrollRunId,
        xmlHash,
        payload: record.payload,
      });

      await this.databaseService.query(
        `
        INSERT INTO esocial.s1200_emission_state (
          tenant_id,
          payroll_run_id,
          employee_id,
          recibo,
          payload_hash,
          emitted_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, now())
        ON CONFLICT (tenant_id, payroll_run_id, employee_id)
        DO UPDATE
        SET recibo = EXCLUDED.recibo,
            payload_hash = EXCLUDED.payload_hash,
            emitted_at = EXCLUDED.emitted_at,
            updated_at = now()
        `,
        [
          tenantId,
          record.payrollRunId,
          record.employeeId,
          event.reference,
          xmlHash,
        ],
      );
      await this.pisPasepService.recomputeYear(
        record.employeeId,
        Number(record.competence.slice(0, 4)),
      );

      results.push({
        eventKind: 'S-1200',
        employeeId: record.employeeId,
        payrollRunId: record.payrollRunId,
        xmlHash,
        emitted: true,
        event,
      });
    }

    return results;
  }

  async emitS1210(
    paymentBatchId: string,
    input: { employeeId?: string; force?: boolean } = {},
  ): Promise<ES04DispatchResult[]> {
    const tenantId = this.currentTenantId();
    const records = await this.s1210Builder.build(
      tenantId,
      paymentBatchId,
      input.employeeId,
    );
    const results: ES04DispatchResult[] = [];

    for (const record of records) {
      const xmlHash = sha256(record.xml);
      const current = await this.databaseService.query<StateRow>(
        `
        SELECT payload_hash
        FROM esocial.s1210_emission_state
        WHERE tenant_id = $1::uuid
          AND payment_batch_id = $2::uuid
          AND employee_id = $3::uuid
        `,
        [tenantId, record.paymentBatchId, record.employeeId],
      );
      if (current[0]?.payload_hash === xmlHash && !input.force) {
        results.push({
          eventKind: 'S-1210',
          employeeId: record.employeeId,
          payrollRunId: record.payrollRunId,
          paymentBatchId: record.paymentBatchId,
          xmlHash,
          emitted: false,
          blockedReason: 'payload_hash_unchanged',
        });
        continue;
      }
      if (current[0]?.payload_hash === xmlHash && input.force) {
        throw new ConflictException(
          'S-1210 reemission is blocked because payload_hash did not change',
        );
      }

      const event = await this.emitService.emit({
        tenantId,
        eventKind: 'S-1210',
        xml: record.xml,
        reference: record.reference,
        competence: record.competence,
        sourceEntityKind: 'payroll.payment_remittance_file',
        sourceEntityId: record.paymentBatchId,
        payrollRunId: record.payrollRunId ?? undefined,
        paymentBatchId: record.paymentBatchId,
        xmlHash,
        payload: record.payload,
      });

      await this.databaseService.query(
        `
        INSERT INTO esocial.s1210_emission_state (
          tenant_id,
          payment_batch_id,
          employee_id,
          recibo,
          payload_hash,
          emitted_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, now())
        ON CONFLICT (tenant_id, payment_batch_id, employee_id)
        DO UPDATE
        SET recibo = EXCLUDED.recibo,
            payload_hash = EXCLUDED.payload_hash,
            emitted_at = EXCLUDED.emitted_at,
            updated_at = now()
        `,
        [
          tenantId,
          record.paymentBatchId,
          record.employeeId,
          event.reference,
          xmlHash,
        ],
      );

      results.push({
        eventKind: 'S-1210',
        employeeId: record.employeeId,
        payrollRunId: record.payrollRunId,
        paymentBatchId: record.paymentBatchId,
        xmlHash,
        emitted: true,
        event,
      });
    }

    return results;
  }

  async emitS1202(
    payrollRunId: string,
    input: { employeeId?: string; force?: boolean } = {},
  ): Promise<ES04DispatchResult[]> {
    const tenantId = this.currentTenantId();
    const records = await this.s1202Builder.build(
      tenantId,
      payrollRunId,
      input.employeeId,
    );
    const results: ES04DispatchResult[] = [];

    for (const record of records) {
      const xmlHash = sha256(record.xml);
      const current = await this.databaseService.query<StateRow>(
        `
        SELECT payload_hash
        FROM esocial.s1202_emission_state
        WHERE tenant_id = $1::uuid
          AND payroll_run_id = $2::uuid
          AND employee_id = $3::uuid
        `,
        [tenantId, record.payrollRunId, record.employeeId],
      );
      if (current[0]?.payload_hash === xmlHash && !input.force) {
        results.push({
          eventKind: 'S-1202',
          employeeId: record.employeeId,
          payrollRunId: record.payrollRunId,
          xmlHash,
          emitted: false,
          blockedReason: 'payload_hash_unchanged',
        });
        continue;
      }
      if (current[0]?.payload_hash === xmlHash && input.force) {
        throw new ConflictException(
          'S-1202 reemission is blocked because payload_hash did not change',
        );
      }

      const event = await this.emitService.emit({
        tenantId,
        eventKind: 'S-1202',
        xml: record.xml,
        reference: record.reference,
        competence: record.competence,
        sourceEntityKind: 'payroll.payroll_run',
        sourceEntityId: record.payrollRunId,
        payrollRunId: record.payrollRunId,
        xmlHash,
        payload: record.payload,
      });

      await this.databaseService.query(
        `
        INSERT INTO esocial.s1202_emission_state (
          tenant_id,
          payroll_run_id,
          employee_id,
          recibo,
          payload_hash,
          emitted_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, now())
        ON CONFLICT (tenant_id, payroll_run_id, employee_id)
        DO UPDATE
        SET recibo = EXCLUDED.recibo,
            payload_hash = EXCLUDED.payload_hash,
            emitted_at = EXCLUDED.emitted_at,
            updated_at = now()
        `,
        [
          tenantId,
          record.payrollRunId,
          record.employeeId,
          event.reference,
          xmlHash,
        ],
      );
      await this.pisPasepService.recomputeYear(
        record.employeeId,
        Number(record.competence.slice(0, 4)),
      );

      results.push({
        eventKind: 'S-1202',
        employeeId: record.employeeId,
        payrollRunId: record.payrollRunId,
        xmlHash,
        emitted: true,
        event,
      });
    }

    return results;
  }

  currentTenantId(): string {
    const context = RequestContextStore.get();
    const tenantId = context?.actor?.tenantId ?? context?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context is required for ES-04 dispatch');
    }
    return tenantId;
  }
}
