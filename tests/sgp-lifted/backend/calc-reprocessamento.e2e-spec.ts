import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS ??= 'true';

import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { DecimoTerceiroService } from '../../backend/src/folha-pagamento/payroll/decimo-terceiro.service';

const tenantId = '00000000-0000-0000-0000-000000000126';

interface ActiveSnapshotRow extends QueryResultRow {
  line_count: string;
  total_amount: string;
}

describe('CALC-09 payroll reprocessing idempotency (e2e)', () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: DecimoTerceiroService;
  const employeeIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-reprocessamento');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    service = new DecimoTerceiroService(database);

    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'calc09-e2e', 'CALC09', 'CALC-09 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await client.query(
        'DELETE FROM payroll.employee_payroll_item WHERE employee_id = ANY($1::uuid[])',
        [employeeIds],
      );
      await client.query(
        `
        DELETE FROM payroll.payroll_run_status_history history
        USING payroll.payroll_run run
        WHERE history.payroll_run_id = run.id
          AND run.tenant_id = $1::uuid
        `,
        [tenantId],
      );
      await client.query(
        'DELETE FROM payroll.payroll_run WHERE tenant_id = $1::uuid',
        [tenantId],
      );
    } finally {
      client.release();
      await database.onModuleDestroy();
      await pool.end();
    }
  });

  it('soft-deletes calculated lines and converges when the same run is executed twice', async () => {
    await createEmployee('REPROC', '4800.00', '2025-01-01');

    const first = await runAdiantamento();
    const firstSnapshot = await snapshot(first.payrollRunId);

    const second = await runAdiantamento();
    const secondSnapshot = await snapshot(second.payrollRunId);
    const deleted = await pool.query<{ deleted_count: string }>(
      `
      SELECT count(*)::text AS deleted_count
      FROM payroll.employee_payroll_item
      WHERE payroll_run_id = $1::uuid
        AND deleted_at IS NOT NULL
      `,
      [first.payrollRunId],
    );
    const history = await pool.query<{ history_count: string }>(
      `
      SELECT count(*)::text AS history_count
      FROM payroll.payroll_run_status_history
      WHERE payroll_run_id = $1::uuid
      `,
      [first.payrollRunId],
    );

    expect(second.payrollRunId).toBe(first.payrollRunId);
    expect(secondSnapshot.line_count).toBe(firstSnapshot.line_count);
    expect(secondSnapshot.total_amount).toBe(firstSnapshot.total_amount);
    expect(Number(deleted.rows[0]?.deleted_count ?? '0')).toBeGreaterThan(0);
    expect(history.rows[0]?.history_count).toBe('2');
  });

  it('blocks direct line mutation while a run is GENERATED', async () => {
    const run = await runAdiantamento();
    const client = await pool.connect();
    try {
      await setTenantContext(client, ['payroll.run.execute']);
      await expect(
        client.query(
          `
          UPDATE payroll.employee_payroll_item
          SET amount = amount + 1
          WHERE payroll_run_id = $1::uuid
            AND deleted_at IS NULL
          `,
          [run.payrollRunId],
        ),
      ).rejects.toThrow(/GENERATED/);
    } finally {
      client.release();
    }
  });

  async function runAdiantamento() {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: ['payroll.run.execute'],
        actor: {
          sub: 'calc09-e2e',
          username: 'calc09-e2e',
          tenantId,
          groups: [],
          permissions: ['payroll.run.execute'],
        },
      },
      () => service.runAdiantamento(tenantId, 2025),
    );
  }

  async function snapshot(payrollRunId: string): Promise<ActiveSnapshotRow> {
    const result = await pool.query<ActiveSnapshotRow>(
      `
      SELECT count(*)::text AS line_count, coalesce(sum(amount), 0)::text AS total_amount
      FROM payroll.v_payroll_run_line_active
      WHERE payroll_run_id = $1::uuid
      `,
      [payrollRunId],
    );
    return result.rows[0];
  }

  async function createEmployee(
    code: string,
    salaryAmount: string,
    startsOn: string,
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      const suffix = `${code}-${Date.now().toString(36)}`;
      const link = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employment_link (tenant_id, code, name, status)
        VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC09-LINK-${suffix}`, `CALC-09 ${code}`],
      );
      const functionalStatus = await client.query<{ id: string }>(
        `
        INSERT INTO hr.functional_status (
          tenant_id, code, description, enters_payroll, lifecycle_status, status
        )
        VALUES ($1::uuid, $2, 'CALC-09 active', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC09-FS-${suffix}`],
      );
      const shift = await client.query<{ id: string }>(
        `
        INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
        VALUES ($1::uuid, $2, 'CALC-09 shift', 8.00, 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC09-SHIFT-${suffix}`],
      );
      const salary = await client.query<{ id: string }>(
        `
        INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
        VALUES ($1::uuid, $2, 'CALC-09 salary', $3::numeric, DATE '2025-01-01')
        RETURNING id::text
        `,
        [tenantId, `CALC09-SAL-${suffix}`, salaryAmount],
      );
      const employee = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employee (
          tenant_id, registration, name, employment_link_id, functional_status_id,
          salary_reference_id, shift_id, hired_on, lifecycle_status
        )
        VALUES (
          $1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
          $8::date, 'ACTIVE'::"EmployeeLifecycleStatus"
        )
        RETURNING id::text
        `,
        [
          tenantId,
          `CALC09-${suffix}`,
          `CALC-09 ${code}`,
          link.rows[0].id,
          functionalStatus.rows[0].id,
          salary.rows[0].id,
          shift.rows[0].id,
          startsOn,
        ],
      );
      await client.query(
        `
        INSERT INTO hr.employee_status_history (
          tenant_id, employee_id, functional_status_id, starts_on
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date)
        `,
        [tenantId, employee.rows[0].id, functionalStatus.rows[0].id, startsOn],
      );
      employeeIds.push(employee.rows[0].id);
    } finally {
      client.release();
    }
  }
});

async function setBypassContext(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'true', false)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    tenantId,
  ]);
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [
    tenantId,
  ]);
}

async function setTenantContext(
  client: PoolClient,
  permissions: string[],
): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'false', false)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    tenantId,
  ]);
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [
    tenantId,
  ]);
  await client.query(
    "SELECT set_config('app.current_permissions', $1, false)",
    [permissions.join('\n')],
  );
  await client.query("SELECT set_config('app.authenticated', 'true', false)");
}

describe('Wave 7 test debt guardrails', () => {
  describe('403 negative path', () => {
    it('returns 403 when an authenticated actor lacks the required permission', async () => {
      await expectForbiddenNegativePath();
    });
  });

  describe('frozen clock', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_TEST_TIME);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('uses a deterministic system time', () => {
      expect(new Date().toISOString()).toBe(FROZEN_TEST_TIME.toISOString());
    });
  });
});
