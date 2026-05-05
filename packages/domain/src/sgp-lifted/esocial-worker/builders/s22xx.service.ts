import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';

import { DatabaseService } from '../../database/database.service';
import { S2200Builder } from './s2200.builder';
import { S2205Builder } from './s2205.builder';
import { S22xxDispatchResult, S22xxDispatchService } from './s22xx-common';

interface WorkerRow extends QueryResultRow {
  employee_id: string;
}

interface StatusRow extends QueryResultRow {
  employee_id: string;
  registration: string;
  name: string;
  recibo: string | null;
  emitted_at: Date | string | null;
  pending_s2205: string;
}

@Injectable()
export class S22xxService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly dispatchService: S22xxDispatchService,
    private readonly s2200Builder: S2200Builder,
    private readonly s2205Builder: S2205Builder,
  ) {}

  async listStatus(): Promise<
    Array<{
      employeeId: string;
      registration: string;
      name: string;
      s2200Receipt: string | null;
      s2200EmittedAt: string | null;
      pendingS2205: number;
    }>
  > {
    const tenantId = this.dispatchService.currentTenantId();
    const rows = await this.databaseService.query<StatusRow>(
      `
      SELECT
        e.id::text AS employee_id,
        e.registration,
        e.name,
        state.recibo,
        state.emitted_at,
        count(pending.id)::text AS pending_s2205
      FROM hr.employee e
      LEFT JOIN esocial.s2200_emission_state state
        ON state.tenant_id = e.tenant_id
       AND state.employee_id = e.id
      LEFT JOIN esocial.s2205_pending_alteration pending
        ON pending.tenant_id = e.tenant_id
       AND pending.employee_id = e.id
       AND pending.status = 'PENDING'
      WHERE e.tenant_id = $1::uuid
      GROUP BY e.id, e.registration, e.name, state.recibo, state.emitted_at
      ORDER BY e.registration
      `,
      [tenantId],
    );

    return rows.map((row) => ({
      employeeId: row.employee_id,
      registration: row.registration,
      name: row.name,
      s2200Receipt: row.recibo,
      s2200EmittedAt: row.emitted_at
        ? new Date(row.emitted_at).toISOString()
        : null,
      pendingS2205: Number(row.pending_s2205),
    }));
  }

  async emitS2200(
    employeeId: string,
    input: { competence?: string; force?: boolean } = {},
  ): Promise<S22xxDispatchResult> {
    const tenantId = this.dispatchService.currentTenantId();
    const record = await this.s2200Builder.build(
      tenantId,
      employeeId,
      input.competence,
    );
    return this.dispatchService.emitS2200(record, input);
  }

  async emitPendingS2205(
    employeeId: string,
    input: { competence?: string } = {},
  ): Promise<S22xxDispatchResult> {
    const tenantId = this.dispatchService.currentTenantId();
    const { record, pendingIds } = await this.s2205Builder.buildPending(
      tenantId,
      employeeId,
      input.competence,
    );
    return this.dispatchService.emitS2205(record, pendingIds);
  }

  async processPending(limit = 20): Promise<S22xxDispatchResult[]> {
    const tenantId = this.dispatchService.currentTenantId();
    const rows = await this.databaseService.query<WorkerRow>(
      `
      SELECT DISTINCT employee_id::text
      FROM esocial.s2205_pending_alteration
      WHERE tenant_id = $1::uuid
        AND status = 'PENDING'
      ORDER BY employee_id::text
      LIMIT $2
      `,
      [tenantId, Math.max(1, Math.min(limit, 100))],
    );

    const results: S22xxDispatchResult[] = [];
    for (const row of rows) {
      results.push(await this.emitPendingS2205(row.employee_id));
    }
    return results;
  }
}
